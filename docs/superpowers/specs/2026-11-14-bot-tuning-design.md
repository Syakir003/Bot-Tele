# Tuning Bot HDB Airconds — Design Spec

Tanggal: 2026-11-14
Branch: `claude/bot-tuning-hna5wf`
Status: **sudah diimplementasi** (lihat bagian "Deviasi dari spec" di bawah)

## 1. Tujuan

Bot Telegram ini sekarang adalah asisten **HDB Airconds** (barang, keuangan, transaksi), bukan lagi bot Kronik (chat AI, pengeluaran pribadi, pengingat). Tuning ini punya lima sasaran:

1. **Bot hanya menjawab urusan HDB Airconds.** Tidak ada jawaban lain.
2. **Cepat dan hemat Firebase.** Data sudah ribuan record, sementara semua query sekarang menarik satu node penuh.
3. **Parser Gemini akurat dan tidak bisa dibujuk keluar jalur.**
4. **Interaktif.** Setiap perintah user dijawab dengan pertanyaan balik, tombol, atau konfirmasi, bukan penolakan.
5. **Tidak ada data salah yang masuk diam-diam.**

### Keputusan yang sudah diambil bersama user

| Topik | Keputusan |
|---|---|
| Fokus | Performa Firebase, akurasi parser Gemini, UX |
| Firebase Rules | **Tidak boleh disentuh** (jadi tidak ada `.indexOn` / `orderByChild` ber-index) |
| Skala data | Ribuan record |
| Strategi data | Cache realtime di memori (pendekatan A) |
| Tulis ke DB | **Konfirmasi dulu** lewat kartu preview, bukan simpan langsung |
| Domain | Hanya HDB Airconds, termasuk menolak pertanyaan teknis AC umum |

### Di luar cakupan (YAGNI)

Tombol stok ±1, pencatatan transaksi penjualan dari bot, ekspor data, fitur Kronik lama (chat bebas, pengeluaran pribadi, pengingat), Redis/persistensi sesi.

## 2. Kondisi sekarang (hasil audit kode)

| # | Temuan | Lokasi |
|---|---|---|
| 1 | Tiap aksi menarik seluruh node dengan `.once("value")` lalu memfilter di memori | `services/barang.js`, `keuangan.js`, `transaksi.js` |
| 2 | Gerbang owner **terbuka untuk semua orang** bila `OWNER_TELEGRAM_ID` kosong | `bot.js:25` |
| 3 | Output Gemini hanya di-`JSON.parse`, tidak divalidasi; teks user dimasukkan mentah ke prompt | `services/parser.js` |
| 4 | Semua pesan bebas selalu menembak Gemini, tanpa JSON mode, `temperature`, atau retry | `parser.js`, `config/gemini.js` |
| 5 | `parseJumlah("1.500.000")` menghasilkan **1.5** | `services/util.js` |
| 6 | Tombol angka menunjuk indeks di `s.barangList` / `keuanganList` / `transaksiList` yang ditimpa tiap list baru, sehingga tap di list lama bisa memilih item yang salah | `bot.js` (`detailbrg`, `detailk`, `detailtrx`) |
| 7 | `parse_mode: "Markdown"` dipakai untuk teks dinamis; karakter `_ * [` memicu error 400 | `bot.js` |
| 8 | `dayjs()` memakai timezone server; tanggal dan "bulan ini" bisa meleset dari WIB | `keuangan.js`, `barang.js` |
| 9 | "hari ini masuk berapa aja" hanya menampilkan 15 transaksi terakhir, filter tanggal diabaikan | `parser.js`, `bot.js` |
| 10 | Pesan hapus menjanjikan "bisa dikembalikan" padahal tidak ada fitur restore | `bot.js` |
| 11 | State `menunggu` tersebar dalam 8 `if` berantai, tanpa kedaluwarsa | `bot.js` |
| 12 | `parseInt(teks) \|\| 0` mengubah input sampah jadi stok 0 secara diam-diam | `bot.js` (`lanjutTambahBarang`) |
| 13 | Merek/model dipisah di spasi pertama sehingga "Mitsubishi Heavy SRK" terpotong | `bot.js` (`lanjutTambahBarang`) |
| 14 | `kirimGrafik` mengirim angka keuangan bisnis ke `quickchart.io` | `bot.js` |
| 15 | Dead code: `intentParser.js` dan `hdb.js` tidak di-import siapa pun | `services/` |
| 16 | README dan MEMORY.md basi (masih menggambarkan bot Kronik; README menyebut `FIREBASE_SERVICE_ACCOUNT_JSON` padahal kode dan `.env.example` memakai `FIREBASE_SERVICE_ACCOUNT_PATH`) | `README.md`, `MEMORY.md` |

## 3. Arsitektur target

```
src/
  bot.js                  # wiring Telegraf: middleware, registrasi handler (tipis)
  config/
    firebase.js           # PATH utama, JSON opsional
    gemini.js             # model + generationConfig (JSON mode, temperature 0)
  data/
    cache.js              # buatCache(path): listener child_*, Map, versi, siap
  services/               # fungsi murni di atas array dari cache + fungsi tulis
    barang.js  keuangan.js  transaksi.js
  nlu/
    cepat.js              # regex fast-path
    gemini.js             # panggilan Gemini + skema + retry
    validasi.js           # whitelist aksi, cek tipe field, normalisasi
    index.js              # parsePesan(teks) -> { aksi, data } | { aksi: "di_luar_hdb" | "tidak_jelas" }
  interaksi/
    sesi.js               # sesi per user, TTL, draft
    langkah.js            # tabel langkah -> handler (pengganti if-chain)
    draft.js              # kelengkapan field, kartu konfirmasi
  tampilan/
    format.js             # esc(), formatRupiah, template pesan (HTML)
    daftar.js             # paginasi, grid tombol
  waktu.js                # TZ Asia/Jakarta, parse tanggal, periode
```

Pemecahan `bot.js` (515 baris, semua jadi satu) ke modul di atas adalah bagian dari tuning karena tanpa itu mesin interaksi dan paginasi tidak bisa diuji. Pola yang ada dipertahankan: `config/` untuk koneksi, `services/` untuk logika, nama variabel dan fungsi berbahasa Indonesia.

## 4. Data layer (cache realtime)

### 4.1 `data/cache.js`

`buatCache(path)` untuk satu node Firebase:

1. Memasang `child_added`, `child_changed`, `child_removed` pada `db.ref(path)`; hasil disimpan di `Map<id, item>`.
2. Memanggil `once("value")` sekali. Event ini terjadi setelah seluruh `child_added` awal, jadi dipakai sebagai sinyal `siap`.
3. Menormalisasi item saat masuk cache: angka lewat `Number()`, `tanggal` kosong diberi default, dan dibuat field turunan `_teks` (huruf kecil) untuk pencarian.
4. Memiliki counter `versi` yang naik tiap perubahan, dipakai untuk memo hasil agregasi.

Tiga instance: `barang`, `keuangan`, `transaksi`. Node `*_terhapus` tidak di-cache.

### 4.2 Alur

```
boot -> await tiga cache siap -> bot.launch()
tulis  -> Firebase -> SDK memicu event lokal sinkron -> cache ter-update
app HDB lain menulis -> listener menangkap delta -> cache ter-update
baca   -> dari Map di RAM, tanpa network
```

### 4.3 Service

- `barang.js`, `keuangan.js`, `transaksi.js` tidak lagi memanggil `.once("value")`. Isinya fungsi filter/sort/agregasi di atas array dari cache.
- `daftarKategori`, `daftarMerek`, `rekapKeuangan`, dan urutan transaksi di-memo per `versi`.
- Fungsi tulis (`tambah`, `edit`, `hapus`) tetap menulis ke Firebase. Allowlist field dan soft delete ke `*_terhapus` dipertahankan.
- Baru: `pulihkan(id)` per service, memindahkan data dari `*_terhapus` kembali dengan ID yang sama.

### 4.4 Error handling

- Listener gagal (mis. permission denied): log jelas lalu `process.exit(1)` agar PM2 restart. Gagal diam-diam lebih berbahaya daripada crash.
- Koneksi putus: SDK reconnect sendiri dan mengirim delta yang terlewat; tidak butuh logika tambahan.
- Boot mencetak jumlah record dan perkiraan RAM tiap cache.

### 4.5 Trade-off yang diterima

- Download penuh terjadi sekali tiap bot start (`pm2 restart`), setelah itu hanya delta.
- RAM naik sebanding jumlah data. Pada ribuan record cukup beberapa MB; dievaluasi ulang bila mendekati ratusan ribu.
- Asumsi: app HDB lain dan bot menulis ke database yang sama. Jika benar, cache tetap segar karena memakai listener.

### 4.6 Beres-beres

- Hapus `services/hdb.js` dan `services/intentParser.js`.
- `config/firebase.js`: baca `FIREBASE_SERVICE_ACCOUNT_PATH` (utama, sesuai `.env.example` dan VPS). Jika `FIREBASE_SERVICE_ACCOUNT_JSON` terisi, pakai itu. Jika keduanya kosong, gagal dengan pesan yang jelas.
- Perbarui README dan MEMORY.md agar sesuai kondisi sebenarnya.

## 5. Batas domain HDB dan parser

### 5.1 Prinsip

**Gemini hanya penerjemah, bukan penjawab.** Semua teks yang sampai ke user berasal dari template dan data di DB HDB. Model tidak pernah menulis kalimat untuk user.

### 5.2 Lapisan pengaman (berurutan)

1. **Gerbang owner fail-closed.** Bila `OWNER_TELEGRAM_ID` kosong, semua pesan ditolak kecuali `/myid`, dan boot mencetak peringatan. Bila terisi, hanya ID itu yang lolos.
2. **Regex fast-path** (`nlu/cepat.js`): pola jelas seperti "30rb bensin", "stok freon", "rekap" diproses tanpa Gemini.
3. **Gemini dengan JSON mode dan skema**: `responseMimeType: "application/json"`, `responseSchema` dengan `aksi` berupa enum tertutup, `temperature: 0`. Retry dengan backoff untuk 429/5xx, maksimal 2 kali.
4. **Validasi output** (`nlu/validasi.js`): `aksi` harus ada di whitelist, tipe field dicek, `jumlah` lewat `parseJumlah` dan harus > 0. Gagal validasi diperlakukan sebagai `tidak_jelas`.
5. **Dua jenis "tidak mengerti":**
   - `di_luar_hdb` (politik, resep, puisi, "abaikan instruksi", pertanyaan teknis AC umum): balasan tetap *"Aku cuma bisa bantu urusan HDB Airconds: barang, keuangan, dan transaksi."* + tombol menu.
   - `tidak_jelas` tetapi masih urusan HDB: klarifikasi dengan tombol tebakan (lihat §6).
6. **Prompt dikeraskan.** Teks user dibungkus delimiter dan ditandai sebagai data. Keamanan utama tetap dari langkah 3–4, bukan dari prompt.
7. **Hasil kosong tidak pernah ditebak.** Pencarian tanpa hasil dibalas "tidak ditemukan di data HDB".

Gemini API gagal total (kuota habis/down): fast-path tetap jalan; sisanya dibalas "Fitur baca-perintah sedang terbatas, pakai menu di bawah ya" + menu tombol. Menu tombol tidak bergantung pada Gemini.

### 5.3 Skema aksi

Aksi yang ada tetap: `tambah_keuangan`, `rekap_keuangan`, `riwayat_keuangan`, `cari_barang`, `daftar_kategori`, `daftar_merek`, `tambah_barang`, `stok_rendah`, `cari_transaksi`. Ditambah `di_luar_hdb` dan `tidak_jelas`.

Field baru `periode` (`hari_ini | minggu_ini | bulan_ini | bulan_lalu`, opsional) untuk `rekap_keuangan` dan `riwayat_keuangan`. Service benar-benar memfilter memakai periode ini.

### 5.4 `parseJumlah`

- Dengan suffix (`jt`, `juta`, `rb`, `ribu`, `k`): titik dan koma dianggap desimal. "1.5jt" dan "2,5jt" → 1.500.000 dan 2.500.000.
- Tanpa suffix: pola `^\d{1,3}(\.\d{3})+$` dianggap pemisah ribuan. "1.500.000" → 1500000.
- Hasil ≤ 0 ditolak. Hasil > Rp1.000.000.000 ditandai peringatan di kartu konfirmasi.

## 6. Mesin interaksi

### 6.1 Draft

Aksi yang menulis ke DB (catat uang, tambah barang, edit, hapus) tidak langsung dieksekusi. Aksi itu menjadi draft di sesi user:

```
s.draft = { id, aksi, data, kurang: [...], kadaluarsa: +10 menit }
```

### 6.2 Alur

```
pesan user
  -> parser (regex dulu, Gemini bila perlu) -> { aksi, data }
  -> cek kelengkapan per aksi (tabel field wajib)
       |- ada yang kurang -> tanya SATU field
       |     pilihan terbatas = tombol (jenis, kategori yang ada, satuan)
       |     bebas = minta ketik (nominal, keterangan)
       '- lengkap -> kartu preview:
             "Catat 🟢 Rp350.000 — servis AC pak budi?"
             [✅ Simpan] [✏️ Ubah] [❌ Batal]
  -> Simpan = tulis ke DB, balas hasil + tombol Edit/Hapus
  -> Ubah   = pilih field -> ketik nilai baru -> kembali ke preview
```

### 6.3 Aturan

- **Aksi baca** (cari, rekap, list, stok rendah) langsung jalan tanpa konfirmasi.
- **Satu router** `langkah -> handler` menggantikan if-chain `s.menunggu`. Menambah alur baru cukup menambah satu entri.
- **Kedaluwarsa 10 menit.** `/batal` dan tombol ❌ tersedia kapan saja. Tombol dari draft yang sudah hilang dibalas "Sesi kedaluwarsa, ulangi ya".
- **Callback membawa ID draft** (`ok:<id>`), sehingga tombol draft lama tidak bisa menyimpan draft baru.
- **Sesi tetap in-memory.** Bot berjalan satu proses di PM2; draft hilang saat restart adalah perilaku yang wajar.
- **Saat bot menunggu jawaban**, pesan berikutnya selalu dianggap jawaban. Bila tidak valid: "Itu belum kebaca sebagai nominal. Coba lagi, atau [❌ Batal]". Tidak ada tebak-tebakan yang bisa nyasar.
- **`tidak_jelas` yang masih urusan HDB** dijawab dengan tebakan berupa tombol: `[Cari barang] [Catat uang] [Cek transaksi]`.

## 7. Tampilan dan input

### 7.1 Perbaikan bug tampilan

| Bug (§2) | Perbaikan |
|---|---|
| #6 tombol menunjuk indeks | Tombol membawa ID Firebase (`detailbrg:<id>`, muat di batas 64 byte); detail dicari dari cache. Properti `barangList`/`keuanganList`/`transaksiList` dihapus dari sesi. |
| #7 Markdown | Semua pesan memakai `parse_mode: "HTML"` dan `esc()` untuk setiap teks dinamis. |
| #8 timezone | `process.env.TZ = "Asia/Jakarta"` di baris pertama `bot.js`. |
| #9 filter tanggal | Field `periode` (§5.3); rekap diberi tombol ganti periode. |
| #10 janji restore | Tombol `[↩️ Urungkan]` setelah hapus memakai `pulihkan(id)`. |

### 7.2 Paginasi

- 8 item per halaman (aman di bawah batas 4096 karakter), baris navigasi `[⬅️] [1/3] [➡️]`; pindah halaman meng-*edit* pesan yang sama.
- Kueri list disimpan di sesi dengan ID pendek (`hal:<kid>:<n>`) dan kedaluwarsa bersama draft. Tombol basi dibalas "Sesi kedaluwarsa, buka ulang ya".
- Barang dengan `stok <= stokMinimal` diberi penanda ⚠️.

### 7.3 Input

- **Tanggal:** tombol `[Hari ini] [Kemarin] [2 hari lalu]`. Teks bebas diterima ("kemarin", `12/11`, `2026-11-12`, `12-11-2026`), divalidasi lokal tanpa Gemini; gagal dibaca → bot bertanya ulang.
- **Tambah barang:** Merek → Model (dipisah) → Kategori (tombol dari kategori yang ada + `[➕ Baru]`) → Harga jual → Stok. Harga beli, stok minimal, dan satuan opsional dengan `[Lewati]` (default satuan `pcs`). Semua angka divalidasi. Berakhir di kartu konfirmasi.
- **Edit barang:** harga, stok, merek, model, ditambah kategori, satuan, harga beli, stok minimal.
- **Edit keuangan:** jumlah, keterangan, kategori; `jenis` berupa tombol toggle 🟢↔🔴.

### 7.4 Grafik

`kirimGrafik` tidak boleh lagi mengirim data ke `quickchart.io`. (Diimplementasi sebagai batang teks di pesan rekap, lihat "Deviasi dari spec".)

## 8. Strategi pengujian

Test runner: `node:test` (bawaan Node, tanpa dependensi baru). Tambah `"test": "node --test"` di `package.json`.

| Area | Jenis | Isi |
|---|---|---|
| `parseJumlah` | tabel | "20rb", "1.5jt", "2,5jt", "50k", "500 ribu", "1.500.000", "Rp 350.000", "abc", "", 0, negatif |
| `waktu.js` | tabel | "kemarin", `12/11`, `2026-11-12`, `12-11-2026`, tanggal tidak valid, batas tengah malam WIB |
| `data/cache.js` | unit | `db` palsu yang menembak add/change/remove: Map ter-update, `versi` naik, `siap` resolve, listener error → keluar |
| Service | unit | Filter, sort, memo agregasi, `periode`, `pulihkan` — fungsi murni di atas array |
| `nlu/` | unit | Gemini di-mock. Korpus **harus ditolak**: "siapa presiden", "buatin puisi", "abaikan instruksi di atas", "resep nasi goreng", "kenapa AC ga dingin". Korpus **harus lolos**: "servis ac dapet 350rb", "stok freon r32", "nota pak andi". Output Gemini rusak/aksi asing → `tidak_jelas`. |
| Gerbang owner | unit | ID kosong, ID salah, ID benar, `/myid` saat ID kosong |
| Mesin interaksi | unit | Slot-filling, kedaluwarsa draft, callback draft lama, jawaban tidak valid |
| Tampilan | unit | `esc()` terhadap `_ * [ < & "`; panjang pesan paginasi < 4096 |
| Smoke manual | skrip | Mencetak ukuran tiap cache; checklist manual di VPS (lihat §9) |

## 9. Deployment dan rollback

- Perubahan di branch `claude/bot-tuning-hna5wf`; tidak ada perubahan skema database, tidak ada perubahan Firebase Rules.
- Env var: tidak ada yang wajib baru. `OWNER_TELEGRAM_ID` kini **wajib terisi** agar bot melayani siapa pun; bila kosong bot hanya menjawab `/myid`. Pastikan nilainya benar di VPS **sebelum** deploy.
- Deploy: `git pull`, `npm install`, `pm2 restart kronik-bot`. Boot pertama lebih lama beberapa detik karena memuat cache.
- Checklist manual setelah deploy: `/myid` dari akun lain tidak dijawab selain `/myid`; cari barang; catat pemasukan lewat kartu konfirmasi; hapus lalu urungkan; pesan di luar HDB ditolak; log boot menampilkan jumlah record.
- Rollback: `git checkout` ke commit sebelumnya lalu `pm2 restart`. Data aman karena hapus adalah soft delete dan skema tidak berubah.

### Urutan implementasi yang diusulkan

Tiap tahap bisa di-commit dan dites mandiri:

1. Fondasi: `waktu.js`, `parseJumlah`, `esc()`, TZ, gerbang owner fail-closed, `firebase.js`, hapus dead code.
2. Data layer: `cache.js` + service di atas cache + `pulihkan`.
3. NLU: fast-path, Gemini JSON mode, validasi, `di_luar_hdb`.
4. Mesin interaksi: sesi, draft, router langkah, kartu konfirmasi.
5. Tampilan: tombol ber-ID, paginasi, flow tambah/edit, periode, grafik lokal.
6. Dokumentasi: README dan MEMORY.md.

## 10. Risiko dan keputusan terbuka

| Risiko / pertanyaan | Penanganan |
|---|---|
| Gemini kuota habis atau down | Fast-path + menu tombol tetap jalan (§5.2) |
| `OWNER_TELEGRAM_ID` salah/kosong di VPS | Bot terkunci (fail-closed), bukan terbuka; peringatan di log boot |
| Pencarian substring bisa lambat pada data besar | Pencarian memakai `_teks` yang sudah di-lowercase di RAM; ribuan record tetap < 1 ms. Diukur di smoke test |
| Data diubah langsung di Firebase Console dengan tipe salah (mis. `stok` string) | Normalisasi saat masuk cache (§4.1) |
| `tanggal` transaksi dari app HDB bertipe campuran | Normalisasi ke angka ms saat masuk cache; item yang tidak bisa dinormalisasi di-log dan di-skip dari urutan |
| ~~Terbuka:~~ grafik | Selesai: batang teks, tanpa dependensi native (lihat "Deviasi dari spec") |
| ~~Terbuka:~~ pertanyaan teknis AC umum ditolak | Sudah diputuskan: ditolak (§5.2). Ubah di `nlu/gemini.js` (INSTRUKSI) bila ingin lain |

## Deviasi dari spec (yang benar-benar dibangun)

Keputusan yang diambil saat implementasi, demi "tinggal `git pull` + restart" tanpa dependensi/env baru:

1. **Grafik** = batang teks (`█`) di pesan rekap, bukan `chartjs-node-canvas`. Tidak ada paket native baru dan tidak ada data yang keluar dari server. Tombol "📊 Grafik" membuka rekap yang sama.
2. **Tambah barang**: harga beli, stok minimal, dan satuan tidak ditanya satu-satu. Kartu konfirmasi memakai default (0, 0, `pcs`) dan ketiganya bisa diisi lewat `[✏️ Ubah]`. Lebih sedikit pertanyaan, hasil akhirnya sama.
3. **Struktur modul** sedikit lebih ringkas dari §3: `app.js` (handler) + `bot.js` (entry), `data/normalisasi.js` dan `data/arsip.js` ditambahkan, `interaksi/langkah.js` dilebur ke router `LANGKAH` di `app.js`.
4. **Firebase**: `FIREBASE_SERVICE_ACCOUNT_PATH` tetap jalur utama (sesuai VPS dan `.env.example`); `FIREBASE_SERVICE_ACCOUNT_JSON` opsional.
5. **Aksi NLU tambahan**: `transaksi_tanggal` ("transaksi kemarin"), `transaksi_terbaru`, `sapa`, selain `di_luar_hdb`/`tidak_jelas`. Pesan saat Gemini mati memakai aksi internal `layanan_terbatas`.
6. **Edit data tersimpan** juga lewat kartu konfirmasi (lama -> baru), sesuai bagian 1.
7. Ditemukan dan diperbaiki saat tes: kategori "Lainnya" (barang tanpa kategori) tidak bisa dibuka dari daftar kategori.
