# Bot HDB Airconds

Bot Telegram pribadi buat ngurus **barang, keuangan, dan transaksi HDB Airconds**. Data dari Firebase Realtime Database, Gemini dipakai cuma buat nerjemahin kalimat jadi perintah.

Bot ini **hanya** ngejawab urusan HDB. Pertanyaan di luar itu (termasuk tanya teknis AC umum) ditolak.

## Fitur

- **Menu tombol** (`/menu`): Keuangan, Barang, Transaksi.
- **Ketik bebas**, contoh:
  - `servis AC pak budi dapet 350rb` → catat pemasukan
  - `bensin 30rb` → catat pengeluaran
  - `cek stok freon`, `stok menipis`, `merek AC apa aja`
  - `rekap bulan ini`, `hari ini masuk berapa aja`
  - `nota pak andi`, `transaksi kemarin`
- **Interaktif**: kalau info kurang, bot nanya balik pakai tombol. Semua yang nulis ke database (catat, tambah, edit) lewat **kartu konfirmasi** `[✅ Simpan] [✏️ Ubah] [❌ Batal]`.
- **Hapus bisa diurungkan** (soft delete ke `*_terhapus`, ada tombol `↩️ Urungkan`).
- List panjang ada halaman (`⬅️ 1/3 ➡️`), rekap bisa ganti periode (hari ini / minggu ini / bulan ini / bulan lalu / semua).
- Command: `/start`, `/menu`, `/batal`, `/myid`, `/transaksi <kata>`, `/invoice <nota>`, `/tanggal <tgl>`, `/kategori`, `/merek`.

## Env (`.env`)

Lihat `.env.example`.

| Variable | Keterangan |
|---|---|
| `TELEGRAM_BOT_TOKEN` | dari @BotFather |
| `GEMINI_API_KEY` | dari aistudio.google.com |
| `FIREBASE_DATABASE_URL` | URL Realtime Database HDB |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | path file JSON service account (jangan di-commit) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | opsional: isi JSON satu baris, dipakai kalau terisi (menggantikan PATH) |
| `OWNER_TELEGRAM_ID` | **wajib**. Kalau kosong bot terkunci dan cuma jawab `/myid` |
| `GEMINI_MODEL` | opsional, default `gemini-flash-lite-latest` |

Pertama kali: kosongin `OWNER_TELEGRAM_ID`, jalanin bot, kirim `/myid`, isi hasilnya ke `.env`, restart.

## Jalanin & update di VPS

```bash
git pull
npm install
pm2 restart kronik-bot      # pertama kali: pm2 start src/bot.js --name kronik-bot
pm2 logs kronik-bot
```

Pas start, bot narik data HDB sekali (log: `Data siap: N barang, ...`), setelah itu cuma nerima perubahan realtime, jadi tiap aksi cepat dan hemat bandwidth Firebase. Timezone dipaksa WIB (`Asia/Jakarta`) apa pun setting server.

## Test

```bash
npm test
```

Tes pakai Firebase, Gemini, dan Telegram palsu (tanpa jaringan), termasuk tes end-to-end yang ngejalanin bot asli.

## Struktur

```
src/
  bot.js            # entry point (env, boot, launch)
  app.js            # semua handler Telegram
  waktu.js          # WIB, parse tanggal, periode
  config/           # koneksi Firebase & Gemini
  data/             # cache realtime + normalisasi + arsip (soft delete)
  services/         # logika barang / keuangan / transaksi
  nlu/              # fast-path regex, Gemini (JSON mode), validasi output
  interaksi/        # sesi, draft + konfirmasi
  tampilan/         # format pesan HTML, paginasi
test/
```
