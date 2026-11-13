const http = require('http');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Config ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.trim() : null;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null;
const PREFIX         = '!ai ';
const MAX_HISTORY    = 10;
const MAX_CHARS      = 1990;
const PORT           = process.env.PORT || 3000;

// Daftar model dengan auto-fallback jika salah satu sedang 503 / high demand
const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
].filter(Boolean);

console.log('[boot] Memulai Discord Gemini AI Bot...');
console.log(`[boot] Model list : ${CANDIDATE_MODELS.join(', ')}`);
console.log(`[boot] DISCORD_TOKEN : ${DISCORD_TOKEN ? 'OK' : 'MISSING'}`);
console.log(`[boot] GEMINI_API_KEY: ${GEMINI_API_KEY ? 'OK' : 'MISSING'}`);

if (!DISCORD_TOKEN || !GEMINI_API_KEY) {
  console.error('[FATAL] DISCORD_TOKEN atau GEMINI_API_KEY belum diset di Environment!');
  process.exit(1);
}

// ─── HTTP Healthcheck (Opsional & Safe) ────────────────────────────────────────
try {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK - Discord Gemini Bot is running\n');
  });
  server.on('error', (err) => {
    console.warn(`[healthcheck] Port ${PORT} dilewati (${err.message}) - Bot tetap aktif.`);
  });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[healthcheck] Server HTTP aktif di port ${PORT}`);
  });
} catch (e) {
  console.warn('[healthcheck] HTTP diabaikan:', e.message);
}

// ─── Gemini Client ────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_INSTRUCTION =
  'Kamu adalah asisten AI yang ramah, santai, dan cerdas di Discord. ' +
  'Gunakan bahasa Indonesia yang natural dan relevan. ' +
  'Jawab secara ringkas, jelas, padat, dan to-the-point.';

// ─── Chat History Store ───────────────────────────────────────────────────────
const chatHistory = new Map();

function getHistory(channelId) {
  if (!chatHistory.has(channelId)) chatHistory.set(channelId, []);
  return chatHistory.get(channelId);
}

function trimHistory(history) {
  while (history.length > MAX_HISTORY) history.shift();
}

// ─── Pesan Queue per channel ──────────────────────────────────────────────────
const queue = new Map();

function enqueue(channelId, task) {
  const prev = queue.get(channelId) || Promise.resolve();
  const next = prev.then(task).catch(console.error);
  queue.set(channelId, next);
  return next;
}

// ─── Fungsi Generate AI dengan Auto-Fallback ──────────────────────────────────
async function generateWithFallback(history, userPrompt) {
  let lastError = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
      });

      const chat = model.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0.7,
        },
      });

      const result = await chat.sendMessage(userPrompt);
      const text = result.response.text().trim();
      return { text, modelName };
    } catch (err) {
      console.warn(`[gemini] Model ${modelName} gagal (${err.message}). Mencoba model cadangan...`);
      lastError = err;
    }
  }

  throw lastError;
}

// ─── Discord Client ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`===============================================`);
  console.log(`[discord] SUKSES ONLINE! Logged in: ${c.user.tag}`);
  console.log(`[discord] Prefix: "${PREFIX}" atau @mention`);
  console.log(`===============================================`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isMentioned = client.user && message.mentions.has(client.user);
  const hasPrefix   = message.content.startsWith(PREFIX);

  if (!isMentioned && !hasPrefix) return;

  let userPrompt = message.content;
  if (hasPrefix)   userPrompt = userPrompt.slice(PREFIX.length).trim();
  if (isMentioned && client.user) userPrompt = userPrompt.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();

  if (!userPrompt) {
    await message.reply('Halo! Ketik pertanyaanmu setelah mention atau prefix `!ai `.\nContoh: `!ai Halo bot, apa kabar?`');
    return;
  }

  enqueue(message.channelId, async () => {
    const typingInterval = setInterval(() => {
      message.channel.sendTyping().catch(() => {});
    }, 4000);
    message.channel.sendTyping().catch(() => {});

    try {
      const history = getHistory(message.channelId);

      const { text: reply, modelName } = await generateWithFallback(history, userPrompt);

      history.push({ role: 'user',  parts: [{ text: userPrompt }] });
      history.push({ role: 'model', parts: [{ text: reply }] });
      trimHistory(history);

      const output = reply.length > MAX_CHARS
        ? reply.slice(0, MAX_CHARS) + '\n*(balasan dipotong karena batas Discord)*'
        : reply;

      await message.reply(output);
    } catch (err) {
      console.error('[gemini] Semua model gagal:', err.message);
      if (err.message && (err.message.includes('503') || err.message.includes('high demand'))) {
        await message.reply('⏳ Server Google AI sedang sangat ramai sesaat (503). Coba kirim lagi dalam 5-10 detik!');
      } else if (err.message && (err.message.includes('429') || err.message.includes('quota'))) {
        await message.reply('⏳ Kuota per menit sedang penuh, tunggu sebentar ya!');
      } else {
        await message.reply('⚠️ Maaf, terjadi kendala koneksi ke AI. Coba beberapa saat lagi.');
      }
    } finally {
      clearInterval(typingInterval);
    }
  });
});

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException',  (err) => console.error('[uncaughtException]', err));

client.login(DISCORD_TOKEN).catch((err) => {
  console.error('[discord] Login gagal:', err.message);
  process.exit(1);
});
