# Kronik Bot — Project Memory

## Ringkasan

Bot Telegram pribadi bernama Kronik, dipakai Syakir buat:

1. Chat AI bebas
2. Catat & rekap pengeluaran pribadi (natural language)
3. Pengingat/reminder terjadwal
4. (RENCANA, belum dibikin) Query data bisnis HDB Airconds (cek stok/harga barang, rekap keuangan, cari transaksi)

## Tech Stack

- Runtime: Node.js
- Bot framework: Telegraf (telegraf)
- AI: Google Gemini API (@google/generative-ai), model gemini-2.5-flash — dipilih karena gratis
- Database: Firebase Realtime Database — SATU project aktif (Firebase pribadi, data pengeluaran & pengingat).
  Firebase HDB Airconds (bisnis AC keluarga) BELUM diintegrasikan — baru rencana, config/service-nya belum dibikin.
- Scheduler: node-cron (cek pengingat jatuh tempo tiap menit)
- Deploy: VPS Hostinger (~/Bot-Tele), dijalankan via PM2 (pm2 start src/bot.js --name kronik-bot)
- Repo: github.com/Syakir003/Bot-Tele (public, 1 commit di remote per 2026-07-22 — banyak perubahan ditaro manual di VPS tanpa di-push)

## Konvensi Kode

- Variable/fungsi pakai Bahasa Indonesia (preferensi Syakir): nilai, hasil, daftar, pengguna, koneksi, dll.
- Struktur folder: src/config/ (koneksi eksternal), src/services/ (logic bisnis), src/bot.js (entry point + routing command).
- Prioritaskan solusi yang gampang di-maintain lewat GitHub, KECUALI file kredensial/sensitif.
- Kredensial Firebase dimasukkan sebagai satu baris JSON di env var `FIREBASE_SERVICE_ACCOUNT_JSON` (bukan path ke file .json).

## Struktur File (verified 2026-07-22, local + VPS identik)

Bot-Tele/
├── src/
│ ├── config/
│ │ ├── firebase.js # koneksi Firebase pribadi (Kronik), baca FIREBASE_SERVICE_ACCOUNT_JSON
│ │ └── gemini.js # client Gemini API
│ ├── services/
│ │ ├── pengeluaran.js # CRUD pengeluaran pribadi
│ │ ├── pengingat.js # CRUD pengingat/reminder
│ │ └── intentParser.js # klasifikasi niat pesan pakai Gemini
│ └── bot.js # entry point, semua command Telegram
├── lihat-db.js # script debug manual: `node lihat-db.js` dump seluruh Firebase pribadi ke console
├── .env.example # template env var, boleh di-commit (isi kosong)
├── .env # SENSITIF — jangan di-commit ke git
├── serviceAccountKey.json # ada di VPS, TAPI TIDAK DIPAKAI (firebase.js baca dari env var, bukan file ini) — cek apa masih perlu
├── package.json
└── README.md

## Firebase Schema — Project Pribadi (Kronik)

pengeluaran/{telegram_id}/{push_id}: { jumlah, kategori, keterangan, tanggal }
pengingat/{telegram_id}/{push_id}: { isi, waktu (ISO), status: "aktif"|"selesai", dibuatPada }

## Firebase Schema — Project HDB Airconds (RENCANA, belum diimplementasi apapun)

Skema di bawah ini asumsi/desain awal dari obrolan lalu, BELUM diverifikasi cocok dengan struktur asli data HDB. Kalau mau bikin integrasi ini, cek dulu struktur data asli di Firebase HDB sebelum coding.

barang/{id}: {
merek, model, kategori, pk,
harga, hargaBeli, stok, stokMinimal,
satuan, barcode, keterangan
}

keuangan/{id}: {
jenis: "pemasukan" | "pengeluaran",
jumlah, kategori, keterangan,
tanggal (format "YYYY-MM-DD")
}

transaksi/{id}: {
nomorNota, pelanggan, supplier, jenis: "jual",
items: [ { barang: {...snapshot barang saat transaksi}, jumlah } ],
bayar, kembali, total,
tanggal (unix timestamp ms)
}

PENTING kalau nanti dibikin: data HDB kemungkinan ribuan record (barang + transaksi). Jangan pernah fetch semua data lalu dump mentah ke chat Telegram — selalu filter/limit query-nya.

## Command Bot yang Sudah Ada (verified dari src/bot.js, 2026-07-22)

| Command                     | Fungsi                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| /start                      | Sambutan                                                                                                         |
| /myid                       | Cek Telegram ID sendiri (buat isi OWNER_TELEGRAM_ID)                                                             |
| /rekap                      | Total pengeluaran pribadi bulan ini per kategori                                                                 |
| /pengingat                  | List reminder aktif                                                                                              |
| pesan bebas (bukan command) | Dikirim ke intentParser.js -> Gemini mengklasifikasi jadi pengeluaran/pengingat/chat -> dieksekusi sesuai intent |

Command yang TIDAK ada (meski sempat tercatat sebagai sudah ada — itu keliru): /riwayat, /db (command bot), /grafik, /cek, /keuangan, /transaksi.
`/db` yang dimaksud sebelumnya ternyata `lihat-db.js`, script CLI terpisah, bukan command Telegram.

## Alur Kerja Fitur Utama

### 1. Catat pengeluaran otomatis (natural language)

User ketik bebas -> intentParser.js kirim ke Gemini dengan prompt klasifikasi -> kalau intent pengeluaran dan ada field jumlah, langsung insert ke pengeluaran/{telegram_id} -> balas konfirmasi ke user.

### 2. Pengingat

Sama alurnya, tapi intent pengingat butuh field waktu (ISO date, timezone Asia/Jakarta). Disimpan status aktif. Cron job (node-cron, jalan tiap menit) scan semua pengingat/\* yang waktu sudah lewat & status masih aktif -> kirim notifikasi ke Telegram user tsb -> ubah status jadi selesai.

## Env Vars (.env, TIDAK BOLEH di-commit ke GitHub — lihat .env.example buat template)

TELEGRAM_BOT_TOKEN=
GEMINI_API_KEY=
FIREBASE_DATABASE_URL=
FIREBASE_SERVICE_ACCOUNT_JSON= (isi seluruh JSON service account sebagai satu baris string, BUKAN path file)
OWNER_TELEGRAM_ID=

## Keamanan — PENTING, jangan dilanggar

- Repo GitHub Bot-Tele di-set Public biar gampang git clone dari VPS tanpa Personal Access Token.
- Selama masih public: `.env` dan file kredensial `.json` (kalau ada) TIDAK BOLEH di-push ke repo. Selalu ditaro manual di VPS langsung (nano), bukan lewat git add/git push.
- .gitignore saat ini cuma exclude: node_modules/, .env, *.log — BELUM exclude `*.json` kredensial. Kalau ada file kredensial .json ditambahkan ke folder project, tambahin dulu ke .gitignore sebelum commit apapun.
- Kalau bikin fitur baru yang butuh secret/API key baru, taro nama variabelnya di .env.example (boleh di-commit, isinya kosong), isi asli cuma di VPS.

## Status Deployment (verified 2026-07-22)

- Bot live & jalan di VPS Hostinger via PM2 (nama proses: kronik-bot), fitur chat/pengeluaran/pengingat jalan.
- Integrasi Firebase HDB **belum pernah dibikin** — koreksi dari catatan sebelumnya yang salah bilang ini sudah "selesai di-drafting". Baik local maupun VPS sama-sama cuma punya config/firebase.js (satu project).
- Satu file belum ke-track git: `lihat-db.js` di root VPS (sudah disalin ke local, siap di-commit).

## Next Steps yang Mungkin Dikerjain

- Commit `lihat-db.js` yang baru disalin dari VPS (belum pernah di-git add).
- Kalau mau lanjut fitur HDB: mulai dari nol — cek dulu struktur data asli Firebase HDB (jangan asumsi skema di atas benar), baru bikin config/firebaseHdb.js + services/hdb.js + command /cek /keuangan /transaksi.
- /stokrendah baru masuk akal SETELAH integrasi HDB (services/hdb.js) ada, karena butuh data barang+stokMinimal dari situ.
- Index Firebase (orderByChild, dsb) buat query HDB juga baru relevan setelah integrasi HDB dibikin.
- Kalau mau nambah fitur baru: ikuti pola existing (config/ buat koneksi, services/ buat logic, command baru di bot.js), dan pakai Bahasa Indonesia buat nama variabel.
