# Bot HDB Airconds — Project Memory

## Ringkasan

Bot Telegram pribadi Syakir buat urusan **HDB Airconds** (bisnis AC keluarga): barang/stok, keuangan, transaksi (nota). Hanya jawab urusan HDB; di luar itu ditolak dengan balasan tetap. Dulu bernama Kronik (chat AI, pengeluaran pribadi, pengingat) — fitur itu sudah **tidak ada** lagi.

## Tech Stack

- Node.js (CommonJS), Telegraf 4, `firebase-admin` (Realtime Database), `@google/generative-ai`, dayjs, dotenv
- Gemini (default `gemini-flash-lite-latest`, ganti lewat `GEMINI_MODEL`) hanya sebagai **penerjemah** kalimat -> JSON `{aksi, data}` (JSON mode + skema + temperature 0). Tidak pernah menulis jawaban buat user.
- Deploy: VPS Hostinger (`~/Bot-Tele`), PM2, nama proses `kronik-bot` (`pm2 start src/bot.js --name kronik-bot`)
- Update: `git pull && npm install && pm2 restart kronik-bot`
- Repo: github.com/Syakir003/Bot-Tele (public — **jangan** pernah commit `.env` / file kredensial; `.gitignore` sudah exclude `*serviceAccount*.json`)

## Konvensi Kode

- Nama variabel/fungsi pakai Bahasa Indonesia.
- `config/` koneksi eksternal, `services/` logika bisnis, `data/` cache Firebase, `nlu/` pembaca perintah, `interaksi/` sesi+draft, `tampilan/` format pesan, `app.js` handler Telegram, `bot.js` entry point.
- Semua pesan ke user `parse_mode: "HTML"`; teks dinamis **wajib** lewat `esc()` (`services/util.js`).
- Tanggal/waktu: `process.env.TZ = "Asia/Jakarta"` (di `waktu.js`). Pakai helper di `waktu.js`.

## Skema Firebase (dari kode)

- `barang/{id}`: merek, model, kategori, pk, harga, hargaBeli, stok, stokMinimal, satuan, barcode, keterangan, dibuatPada
- `keuangan/{id}`: jenis ("pemasukan"|"pengeluaran"), jumlah, kategori, keterangan, tanggal ("YYYY-MM-DD"), dibuatPada
- `transaksi/{id}`: nomorNota, pelanggan, items[{barang:{merek,model,harga,...}, jumlah}], total, bayar, kembali, tanggal (ms epoch). Bot hanya **membaca** transaksi.
- `barang_terhapus/{id}`, `keuangan_terhapus/{id}`: arsip soft delete (data asli + `dihapusPada`), dipakai tombol Urungkan.

## Cara kerja inti

1. **Cache realtime** (`data/cache.js`): sekali download saat boot, setelah itu listener `child_*`. Service baca dari memori (tanpa `.once("value")` per aksi). Listener gagal -> `process.exit(1)` biar PM2 restart.
2. **NLU** (`nlu/`): regex fast-path -> Gemini (retry 429/5xx; skema ditolak 400 -> ulang tanpa skema) -> `validasi.js` (whitelist aksi, tipe field). Percobaan bajak prompt ditolak tanpa panggil Gemini. Gemini mati -> fast-path & menu tombol tetap jalan.
3. **Draft + konfirmasi** (`interaksi/draft.js`, `app.js`): aksi tulis (catat uang, tambah barang, edit) -> tanya field yang kurang -> kartu `[Simpan][Ubah][Batal]`. ID draft di-rotasi tiap kartu/pertanyaan baru, jadi tombol lama basi otomatis. Sesi in-memory, kedaluwarsa 10 menit.
4. **List**: tombol angka membawa **ID item** (bukan indeks), 8 item/halaman, paginasi lewat `hal:<kid>:<n>`.

## Keamanan

- Gerbang owner **fail-closed**: `OWNER_TELEGRAM_ID` kosong -> bot cuma jawab `/myid`.
- Kredensial hanya di `.env` / file di VPS, tidak pernah ke git. Tidak ada data bisnis yang dikirim ke layanan pihak ketiga selain prompt ke Gemini (grafik dibuat sebagai batang teks, bukan lewat quickchart.io lagi).

## Test

`npm test` (`node --test`). `test/helpers/fakeDb.js` = Firebase palsu, `test/helpers/harness.js` = Telegram palsu yang ngejalanin bot asli dan memvalidasi tiap pesan keluar (HTML, panjang, callback_data <= 64 byte).

## Catatan

- Update Telegram dalam satu batch diproses paralel oleh Telegraf; Simpan dijaga flag `menyimpan` agar dobel-tap tidak menulis dua kali.
- Env lama `FIREBASE_SERVICE_ACCOUNT_JSON` sekarang opsional; jalur utama tetap `FIREBASE_SERVICE_ACCOUNT_PATH` (sesuai VPS).
- `lihat-db.js`: skrip CLI buat dump seluruh database ke console (`node lihat-db.js`).
