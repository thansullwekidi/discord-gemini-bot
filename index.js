const http = require('http');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Config ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME     = 'gemini-2.0-flash';
const PREFIX         = '!ai ';
const MAX_HISTORY    = 10;    // pesan per channel (5 user + 5 assistant)
const MAX_CHARS      = 1990;  // batas aman pesan Discord
const PORT           = process.env.PORT || 3000;

// ─── Validasi env vars ────────────────────────────────────────────────────────
if (!DISCORD_TOKEN)  { console.error('[error] DISCORD_TOKEN tidak diset!'); process.exit(1); }
if (!GEMINI_API_KEY) { console.error('[error] GEMINI_API_KEY tidak diset!'); process.exit(1); }

// ─── HTTP Healthcheck (wajib untuk Render.com agar tidak sleep) ───────────────
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK - Discord Gemini Bot is running\n');
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[healthcheck] HTTP server listening on port ${PORT}`);
});

// ─── Gemini Client ────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_INSTRUCTION =
  'Kamu adalah asisten AI yang membantu, ramah, dan cerdas. ' +
  'Jawab dalam bahasa yang sama dengan pengguna (Indonesia atau Inggris). ' +
  'Jawab secara ringkas, jelas, dan akurat. ' +
  'Jika tidak tahu jawabannya, katakan dengan jujur.';

// ─── Chat History Store (per channel) ────────────────────────────────────────
// Map<channelId, Array<{role: 'user'|'model', parts: [{text}]}>
const chatHistory = new Map();

function getHistory(channelId) {
  if (!chatHistory.has(channelId)) chatHistory.set(channelId, []);
  return chatHistory.get(channelId);
}

function trimHistory(history) {
  while (history.length > MAX_HISTORY) history.shift();
}

// ─── Pesan Queue per channel (cegah overload) ─────────────────────────────────
const queue = new Map();

function enqueue(channelId, task) {
  const prev = queue.get(channelId) || Promise.resolve();
  const next = prev.then(task).catch(console.error);
  queue.set(channelId, next);
  return next;
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
  console.log(`[discord] Login berhasil sebagai: ${c.user.tag}`);
  console.log(`[discord] Model: ${MODEL_NAME}`);
  console.log(`[discord] Bot siap! Prefix: "${PREFIX}" atau mention bot`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isMentioned = message.mentions.has(client.user);
  const hasPrefix   = message.content.startsWith(PREFIX);

  if (!isMentioned && !hasPrefix) return;

  // Ekstrak prompt user
  let userPrompt = message.content;
  if (hasPrefix)   userPrompt = userPrompt.slice(PREFIX.length).trim();
  if (isMentioned) userPrompt = userPrompt.replace(`<@${client.user.id}>`, '').trim();

  if (!userPrompt) {
    await message.reply('Halo! Ketik pertanyaanmu setelah mention atau prefix `!ai `.\nContoh: `!ai Apa itu AI?`');
    return;
  }

  enqueue(message.channelId, async () => {
    // Kirim typing indicator
    const typingInterval = setInterval(() => message.channel.sendTyping(), 5000);
    message.channel.sendTyping();

    try {
      const history = getHistory(message.channelId);

      // Buat Gemini chat session dengan history
      const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: SYSTEM_INSTRUCTION,
      });

      const chat = model.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0.7,
        },
      });

      // Kirim pesan ke Gemini
      const result = await chat.sendMessage(userPrompt);
      const reply  = result.response.text().trim();

      // Simpan ke history
      history.push({ role: 'user',  parts: [{ text: userPrompt }] });
      history.push({ role: 'model', parts: [{ text: reply }] });
      trimHistory(history);

      // Potong jika terlalu panjang
      const output = reply.length > MAX_CHARS
        ? reply.slice(0, MAX_CHARS) + '\n*(balasan dipotong)*'
        : reply;

      await message.reply(output);

    } catch (err) {
      console.error('[gemini] Error:', err.message);

      // Handle rate limit khusus
      if (err.message?.includes('429') || err.message?.includes('quota')) {
        await message.reply('⏳ Sedang ramai, coba lagi dalam beberapa detik ya!');
      } else {
        await message.reply('⚠️ Terjadi error. Coba lagi sebentar.');
      }
    } finally {
      clearInterval(typingInterval);
    }
  });
});

// ─── Login Discord ────────────────────────────────────────────────────────────
client.login(DISCORD_TOKEN).catch((err) => {
  console.error('[discord] Login gagal:', err.message);
  process.exit(1);
});
