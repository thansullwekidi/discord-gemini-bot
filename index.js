const http = require('http');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { Ollama } = require('ollama');

// ─── Config ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OLLAMA_HOST   = 'http://127.0.0.1:11434';
const MODEL         = 'qwen2.5:3b';
const PREFIX        = '!ai ';
const MAX_HISTORY   = 6;       // messages per channel (user+assistant pairs)
const MAX_CHARS     = 1990;    // Discord message limit safety margin
const KEEP_ALIVE    = '30m';
const NUM_CTX       = 2048;
const NUM_PREDICT   = 450;

// ─── HTTP Healthcheck Server (required by HF Spaces) ─────────────────────────
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK - Discord Ollama Bot is running\n');
});
server.listen(7860, '0.0.0.0', () => {
  console.log('[healthcheck] HTTP server listening on 0.0.0.0:7860');
});

// ─── Ollama Client ────────────────────────────────────────────────────────────
const ollama = new Ollama({ host: OLLAMA_HOST });

// ─── Chat History Store ───────────────────────────────────────────────────────
// Map<channelId, Array<{role, content}>>
const chatHistory = new Map();

function getHistory(channelId) {
  if (!chatHistory.has(channelId)) chatHistory.set(channelId, []);
  return chatHistory.get(channelId);
}

function trimHistory(history) {
  // Keep at most MAX_HISTORY messages (each user msg + assistant reply = 2)
  while (history.length > MAX_HISTORY) history.shift();
}

// ─── Message Queue (prevent CPU overload on burst requests) ───────────────────
const queue = new Map(); // Map<channelId, Promise>

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
  console.log(`[discord] Logged in as ${c.user.tag}`);
  console.log(`[discord] Model: ${MODEL} | Host: ${OLLAMA_HOST}`);
});

client.on(Events.MessageCreate, async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  const isMentioned = message.mentions.has(client.user);
  const hasPrefix   = message.content.startsWith(PREFIX);

  if (!isMentioned && !hasPrefix) return;

  // Extract user prompt
  let userPrompt = message.content;
  if (hasPrefix) userPrompt = userPrompt.slice(PREFIX.length).trim();
  if (isMentioned) userPrompt = userPrompt.replace(`<@${client.user.id}>`, '').trim();

  if (!userPrompt) {
    await message.reply('Halo! Ketik pertanyaanmu setelah mention atau prefix `!ai `.');
    return;
  }

  // Enqueue per channel to avoid overload
  enqueue(message.channelId, async () => {
    const typingInterval = setInterval(() => message.channel.sendTyping(), 5000);
    message.channel.sendTyping();

    try {
      const history = getHistory(message.channelId);

      // Append user message
      history.push({ role: 'user', content: userPrompt });
      trimHistory(history);

      const response = await ollama.chat({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Kamu adalah asisten AI yang membantu, ramah, dan menjawab dalam bahasa yang sama dengan pengguna. ' +
              'Jawab dengan ringkas dan jelas.',
          },
          ...history,
        ],
        options: {
          keep_alive: KEEP_ALIVE,
          num_ctx:    NUM_CTX,
          num_predict: NUM_PREDICT,
        },
      });

      const reply = response.message.content.trim();

      // Append assistant reply to history
      history.push({ role: 'assistant', content: reply });
      trimHistory(history);

      // Truncate if needed
      const output = reply.length > MAX_CHARS
        ? reply.slice(0, MAX_CHARS) + '\n*(balasan dipotong karena terlalu panjang)*'
        : reply;

      await message.reply(output);
    } catch (err) {
      console.error('[ollama] Error:', err);
      await message.reply('⚠️ Terjadi error saat menghubungi Ollama. Coba lagi sebentar.');
    } finally {
      clearInterval(typingInterval);
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (!DISCORD_TOKEN) {
  console.error('[error] DISCORD_TOKEN environment variable is not set!');
  process.exit(1);
}

client.login(DISCORD_TOKEN).catch((err) => {
  console.error('[discord] Login failed:', err);
  process.exit(1);
});
