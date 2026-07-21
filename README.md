# Kronik Bot

Bot Telegram pribadi: chat AI, pengingat, dan pencatat pengeluaran. Pake Gemini API (gratis) + Firebase Realtime Database.

## Setup Lokal (opsional, kalau ada laptop/PC)

```bash
npm install
cp .env.example .env
# isi .env sesuai punya kamu
npm start
```

## Isi File `.env`

- `TELEGRAM_BOT_TOKEN` → dari @BotFather
- `GEMINI_API_KEY` → dari aistudio.google.com
- `FIREBASE_DATABASE_URL` → dari Firebase Console → Realtime Database
- `FIREBASE_SERVICE_ACCOUNT_JSON` → buka file JSON service account, copy **semua isinya**, paste jadi satu baris
- `OWNER_TELEGRAM_ID` → kosongin dulu, jalanin bot, kirim `/myid` ke bot-nya, baru isi ID yang muncul & restart

## Cara Upload ke GitHub (dari HP, tanpa laptop)

1. Buka github.com/Syakir003, bikin repo baru (misal `kronik-bot`), **jangan** centang "Add README"
2. Di halaman repo kosong, klik **"uploading an existing file"**
3. Upload semua file & folder di zip ini KECUALI folder `node_modules` (ga usah, karena `.gitignore` udah nge-skip itu, dan Railway install otomatis)
4. Commit

## Cara Deploy ke Railway (gratis, jalan 24/7)

1. Daftar di railway.app pake akun GitHub
2. New Project → Deploy from GitHub repo → pilih `kronik-bot`
3. Masuk ke tab **Variables**, tambahin semua isi `.env` kamu satu-satu (nama variable harus sama persis kayak di `.env.example`)
4. Railway otomatis build & jalanin `npm start`
5. Selesai — bot online 24/7, tinggal chat dari Telegram di HP

## Fitur

- **Chat bebas** → langsung kejawab pake AI
- **Catat pengeluaran** → ketik natural, contoh: "abis jajan 20rb", "makan siang 25000"
- **Pengingat** → contoh: "ingetin aku bayar kos besok jam 9 pagi"
- `/rekap` → total pengeluaran bulan ini per kategori
- `/pengingat` → list pengingat yang masih aktif
- `/myid` → cek ID Telegram kamu
