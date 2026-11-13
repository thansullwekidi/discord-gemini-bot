---
title: Discord Ollama AI Bot
emoji: 🤖
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Discord Ollama AI Bot 🤖

Bot Discord bertenaga AI lokal menggunakan [Ollama](https://ollama.com) dengan model `qwen2.5:3b`, di-deploy 24/7 secara gratis di **Hugging Face Spaces** via Docker.

## Fitur
- Merespons mention (`@BotName`) atau prefix `!ai `
- Menyimpan riwayat percakapan per channel (6 pesan terakhir)
- Antrean pesan per channel agar CPU tidak overload
- Healthcheck endpoint di port `7860` (wajib untuk HF Spaces)

## Cara Deploy

### 1. Fork / Clone Space ini
Tekan tombol **Duplicate this Space** di Hugging Face.

### 2. Tambahkan Secret `DISCORD_TOKEN`
1. Buka halaman Space Anda → **Settings** → **Variables and secrets**
2. Klik **New secret**
3. Isi:
   - **Name**: `DISCORD_TOKEN`
   - **Value**: Token bot Discord Anda (dari [Discord Developer Portal](https://discord.com/developers/applications))
4. Klik **Save**

### 3. Aktifkan Privileged Intents
Di Discord Developer Portal → Bot Anda → **Privileged Gateway Intents**:
- ✅ **Message Content Intent** — wajib diaktifkan

### 4. Invite Bot ke Server
Gunakan OAuth2 URL Generator dengan scopes: `bot` + permissions: `Send Messages`, `Read Message History`.

### 5. Build Otomatis
Setelah secret tersimpan, Space akan otomatis rebuild dan bot akan online dalam ~5–10 menit (proses pull model `qwen2.5:3b` ±2 GB).

## Penggunaan
```
!ai Apa itu machine learning?
@BotName Jelaskan fotosintesis secara singkat
```

## Spesifikasi
| Item | Detail |
|------|--------|
| Model | `qwen2.5:3b` |
| Runtime | Ollama + Node.js 20 |
| Hardware | 2 vCPU, 16 GB RAM (HF Spaces Free) |
| Port | 7860 |
