---
title: Discord Gemini AI Bot
emoji: 🤖
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 3000
pinned: false
---

# Discord Gemini AI Bot 🤖

Bot Discord bertenaga **Google Gemini 2.0 Flash** (gratis), di-host di **Render.com** (gratis) — online 24/7 tanpa kartu kredit.

## Arsitektur

```
Discord ←→ Bot (Render.com) ←→ Gemini 2.0 Flash API (Google AI Studio)
                ↑
      UptimeRobot ping /10 menit (anti-sleep)
```

## Cara Deploy ke Render.com

### 1. Siapkan API Keys

**Discord Bot Token:**
1. Buka [discord.com/developers/applications](https://discord.com/developers/applications)
2. New Application → Bot → Reset Token → salin token
3. Aktifkan **Message Content Intent** di menu Bot

**Gemini API Key (gratis, tanpa VCC):**
1. Buka [aistudio.google.com](https://aistudio.google.com)
2. Klik **Get API key** → Create API key
3. Salin key-nya (format: `AIza...`)

### 2. Push ke GitHub

```bash
git init
git add .
git commit -m "deploy discord gemini bot"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
```

### 3. Deploy ke Render.com

1. Buka [dashboard.render.com](https://dashboard.render.com) → **New → Web Service**
2. Connect GitHub repo ini
3. Render otomatis deteksi `render.yaml`
4. Tambahkan **Environment Variables**:
   - `DISCORD_TOKEN` = token bot Discord
   - `GEMINI_API_KEY` = API key dari Google AI Studio
5. Klik **Create Web Service**

### 4. Anti-Sleep (Wajib!)

Render free tier sleep setelah 15 menit tanpa request. Daftarkan URL bot ke:
- **[UptimeRobot.com](https://uptimerobot.com)** → New Monitor → HTTP → ping setiap **5 menit**
- URL: `https://nama-bot.onrender.com`

## Penggunaan

```
!ai Apa itu machine learning?
@NamaBot Jelaskan fotosintesis singkat
```

## Environment Variables

| Variable | Deskripsi |
|----------|-----------|
| `DISCORD_TOKEN` | Token bot Discord |
| `GEMINI_API_KEY` | API key Google AI Studio |
| `PORT` | Port server (otomatis dari Render) |

## Spesifikasi

| Item | Detail |
|------|--------|
| Model | Gemini 2.0 Flash |
| Limit gratis | 1.500 req/hari, 1 juta token/menit |
| Host | Render.com Free |
| Biaya | **Rp 0** |
