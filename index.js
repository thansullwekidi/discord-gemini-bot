const http = require('http');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Config ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN  = process.env.DISCORD_TOKEN  ? process.env.DISCORD_TOKEN.trim()  : null;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : null;
const MODEL_NAME     = 'gemini-2.0-flash-lite'; // Model Google stabil, gratis, kuota besar
const PREFIX         = '!ai ';
const MAX_CHARS      = 1990;
const PORT           = process.env.PORT || 3000;

// ─── Boot log ─────────────────────────────────────────────────────────────────
console.log('[boot] ==========================================');
console.log('[boot] Discord Gemini Bot - Starting...');
console.log(`[boot] Model         : ${MODEL_NAME}`);
console.log(`[boot] DISCORD_TOKEN : ${DISCORD_TOKEN  ? 'OK (' + DISCORD_TOKEN.length  + ' chars)' : '*** MISSING ***'}`);
console.log(`[boot] GEMINI_API_KEY: ${GEMINI_API_KEY ? 'OK (' + GEMINI_API_KEY.length + ' chars)' : '*** MISSING ***'}`);
console.log('[boot] ==========================================');

if (!DISCORD_TOKEN || !GEMINI_API_KEY) {
  console.error('[FATAL] Token/API key belum diset di tab Environment bot-hosting!');
  process.exit(1);
}

// ─── HTTP Healthcheck ─────────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running\n');
});
httpServer.on('error', (e) => console.warn('[healthcheck] Port busy, skip:', e.message));
httpServer.listen(PORT, '0.0.0.0', () => console.log(`[healthcheck] HTTP aktif di port ${PORT}`));

// ─── Gemini Client ────────────────────────────────────────────────────────────
const genAI  = new GoogleGenerativeAI(GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({
  model: MODEL_NAME,
  systemInstruction: 'Kamu adalah asisten AI yang ramah, cerdas, dan santai di Discord. Jawab dalam bahasa yang sama dengan pengguna. Jawab ringkas, jelas, dan to-the-point.',
});

// ─── Discord Client ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', async (c) => {
  console.log(`[discord] ==========================================`);
  console.log(`[discord] BOT ONLINE: ${c.user.tag}`);
  console.log(`[discord] Model aktif: ${MODEL_NAME}`);
  console.log(`[discord] Prefix     : "${PREFIX}" atau @mention`);
  console.log(`[discord] ==========================================`);

  // Register slash command /ai
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(c.user.id), {
      body: [
        new SlashCommandBuilder()
          .setName('ai')
          .setDescription('Tanya ke AI Gemini')
          .addStringOption(o => o.setName('prompt').setDescription('Pertanyaanmu').setRequired(true))
          .toJSON(),
      ],
    });
    console.log('[discord] Slash command /ai terdaftar!');
  } catch (err) {
    console.warn('[discord] Slash command gagal daftar:', err.message);
  }
});

// ─── Helper: panggil Gemini & kirim balasan ───────────────────────────────────
async function askGemini(prompt) {
  const result = await aiModel.generateContent(prompt);
  let text = result.response.text().trim();
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + '\n*(balasan dipotong)*';
  return text;
}

// ─── Slash Command /ai ────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'ai') return;

  const prompt = interaction.options.getString('prompt');
  await interaction.deferReply();
  try {
    const reply = await askGemini(prompt);
    await interaction.editReply(reply);
  } catch (err) {
    console.error('[gemini][slash] Error:', err.message);
    await interaction.editReply(`⚠️ Error AI: ${err.message}`);
  }
});

// ─── Chat biasa: !ai atau @mention ───────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const isMention = client.user && message.mentions.has(client.user);
  const isPrefix  = message.content.startsWith(PREFIX);
  if (!isMention && !isPrefix) return;

  let prompt = message.content;
  if (isPrefix)  prompt = prompt.slice(PREFIX.length).trim();
  if (isMention) prompt = prompt.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
  if (!prompt)   return message.reply('Ketik pertanyaanmu setelah `!ai ` atau @mention saya!');

  message.channel.sendTyping().catch(() => {});
  const typing = setInterval(() => message.channel.sendTyping().catch(() => {}), 4000);

  try {
    const reply = await askGemini(prompt);
    await message.reply(reply);
  } catch (err) {
    console.error('[gemini][msg] Error:', err.message);
    await message.reply(`⚠️ Error AI: ${err.message}`);
  } finally {
    clearInterval(typing);
  }
});

// ─── Error Handling ───────────────────────────────────────────────────────────
process.on('unhandledRejection', err => console.error('[unhandledRejection]', err));
process.on('uncaughtException',  err => console.error('[uncaughtException]',  err));

// ─── Login Discord ────────────────────────────────────────────────────────────
client.login(DISCORD_TOKEN).catch(err => {
  console.error('[discord] Login GAGAL:', err.message);
  process.exit(1);
});
