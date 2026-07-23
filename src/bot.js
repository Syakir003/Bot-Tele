require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const dayjs = require("dayjs");

const { formatRupiah, parseJumlah } = require("./services/util");
const { parsePesan } = require("./services/parser");
const barangSvc = require("./services/barang");
const keuanganSvc = require("./services/keuangan");
const transaksiSvc = require("./services/transaksi");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const OWNER_ID = process.env.OWNER_TELEGRAM_ID;

const sesi = {};
function getSesi(id) {
  if (!sesi[id]) sesi[id] = {};
  return sesi[id];
}
function resetSesi(id) {
  sesi[id] = {};
}

bot.use((ctx, next) => {
  if (OWNER_ID && String(ctx.from?.id || "") !== String(OWNER_ID)) return;
  return next();
});

// ==================== TAMPILAN: format singkat (list bernomor) ====================
function tandaJenis(j) {
  return j === "pemasukan" ? "🟢" : "🔴";
}

function barangSingkat(b, i) {
  return `${i + 1}. *${b.merek} ${b.model}* — ${formatRupiah(b.harga)} (stok ${b.stok})`;
}
function keuanganSingkat(k, i) {
  return `${i + 1}. ${tandaJenis(k.jenis)} ${formatRupiah(k.jumlah)} — ${k.keterangan || k.kategori} (${dayjs(k.tanggal).format("DD MMM")})`;
}
function transaksiSingkat(t, i) {
  return `${i + 1}. 🧾 ${t.nomorNota || "-"} — ${formatRupiah(t.total)} (${t.pelanggan || "-"})`;
}

// ==================== TAMPILAN: format lengkap (1 item) ====================
function barisBarang(b) {
  return `📦 *${b.merek} ${b.model}*\nHarga: ${formatRupiah(b.harga)}  •  Stok: ${b.stok} ${b.satuan || ""}`;
}
function detailBarangLengkap(b) {
  return (
    `📦 *${b.merek} ${b.model}*\n\n` +
    `Kategori: ${b.kategori || "-"}\n` +
    (b.pk ? `PK: ${b.pk}\n` : "") +
    `Harga jual: ${formatRupiah(b.harga)}\n` +
    `Harga beli: ${formatRupiah(b.hargaBeli)}\n` +
    `Stok: ${b.stok} ${b.satuan || ""} (minimal: ${b.stokMinimal || 0})\n` +
    (b.barcode ? `Barcode: ${b.barcode}\n` : "") +
    (b.keterangan ? `Keterangan: ${b.keterangan}\n` : "")
  );
}
function barisKeuangan(k) {
  return `${tandaJenis(k.jenis)} ${dayjs(k.tanggal).format("DD MMM")} — *${formatRupiah(k.jumlah)}*\n${k.keterangan || k.kategori}`;
}
function teksInvoiceLengkap(t) {
  const items = (t.items || [])
    .map((it) => `• ${it.barang?.merek || ""} ${it.barang?.model || ""} x${it.jumlah} @ ${formatRupiah(it.barang?.harga || 0)}`)
    .join("\n");
  return (
    `🧾 *${t.nomorNota || "-"}*\n${dayjs(t.tanggal).format("DD MMM YYYY, HH:mm")}\nPelanggan: ${t.pelanggan || "-"}\n\n` +
    `${items || "(tidak ada item tercatat)"}\n\nTotal: *${formatRupiah(t.total)}*\nBayar: ${formatRupiah(t.bayar)}\nKembali: ${formatRupiah(t.kembali)}`
  );
}

// ==================== MENU ====================
function menuUtama() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💰 Keuangan", "menu:keuangan"), Markup.button.callback("📦 Barang", "menu:barang")],
    [Markup.button.callback("🧾 Transaksi", "menu:transaksi"), Markup.button.callback("📊 Grafik", "aksi:grafik")],
  ]);
}
function menuKeuangan() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📈 Rekap Bulan Ini", "aksi:rekap")],
    [Markup.button.callback("🟢 Lihat Pemasukan", "aksi:list_masuk"), Markup.button.callback("🔴 Lihat Pengeluaran", "aksi:list_keluar")],
    [Markup.button.callback("➕ Catat Pemasukan", "input:masuk"), Markup.button.callback("➖ Catat Pengeluaran", "input:keluar")],
    [Markup.button.callback("« Kembali", "menu:utama")],
  ]);
}
function menuBarang() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📂 Browse Kategori", "aksi:browse_kategori")],
    [Markup.button.callback("🏷️ Browse Merek", "aksi:browse_merek")],
    [Markup.button.callback("🔍 Cari Barang", "input:cari_barang")],
    [Markup.button.callback("⚠️ Stok Menipis", "aksi:stok_rendah")],
    [Markup.button.callback("➕ Tambah Barang", "input:tambah_barang")],
    [Markup.button.callback("« Kembali", "menu:utama")],
  ]);
}
function menuTransaksi() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📋 Transaksi Terbaru", "aksi:transaksi_terbaru")],
    [Markup.button.callback("🔍 Cari Transaksi", "input:cari_transaksi")],
    [Markup.button.callback("📅 Cari per Tanggal", "input:tanggal_transaksi")],
    [Markup.button.callback("« Kembali", "menu:utama")],
  ]);
}

function tombolItemKeuangan(id) {
  return Markup.inlineKeyboard([[Markup.button.callback("✏️ Edit", `editk:${id}`), Markup.button.callback("🗑️ Hapus", `hapusk:${id}`)]]);
}
function tombolItemBarang(id) {
  return Markup.inlineKeyboard([[Markup.button.callback("✏️ Edit", `editb:${id}`), Markup.button.callback("🗑️ Hapus", `hapusb:${id}`)]]);
}

// grid tombol angka 1..n, prefix dipakai buat callback_data (misal "detailbrg")
function tombolGridAngka(jumlah, prefix, perBaris = 5) {
  const baris = [];
  let baris_ini = [];
  for (let i = 0; i < jumlah; i++) {
    baris_ini.push(Markup.button.callback(String(i + 1), `${prefix}:${i}`));
    if (baris_ini.length === perBaris) {
      baris.push(baris_ini);
      baris_ini = [];
    }
  }
  if (baris_ini.length) baris.push(baris_ini);
  return baris;
}

// ==================== START / HELP ====================
bot.start((ctx) => {
  resetSesi(ctx.from.id);
  ctx.reply(
    "Halo! 👋 Saya asisten keuangan & barang HDB Airconds.\n\nSilakan pilih menu di bawah, atau ketik langsung seperti *\"servis AC dapet 350rb\"*, *\"cek stok freon\"*, atau *\"merek AC apa aja\"*.",
    { parse_mode: "Markdown", ...menuUtama() }
  );
});
bot.command("menu", (ctx) => ctx.reply("Menu utama:", menuUtama()));
bot.command("myid", (ctx) => ctx.reply(`ID Telegram Anda: ${ctx.from.id}`));
bot.command("batal", (ctx) => {
  resetSesi(ctx.from.id);
  ctx.reply("Baik, dibatalkan. 👍", menuUtama());
});

// ==================== NAVIGASI MENU ====================
bot.action("menu:utama", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("Menu utama:", menuUtama()); });
bot.action("menu:keuangan", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("💰 *Menu Keuangan*", { parse_mode: "Markdown", ...menuKeuangan() }); });
bot.action("menu:barang", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("📦 *Menu Barang*", { parse_mode: "Markdown", ...menuBarang() }); });
bot.action("menu:transaksi", async (ctx) => { await ctx.answerCbQuery(); await ctx.editMessageText("🧾 *Menu Transaksi*", { parse_mode: "Markdown", ...menuTransaksi() }); });

// ==================== AKSI LANGSUNG ====================
bot.action("aksi:rekap", async (ctx) => {
  await ctx.answerCbQuery();
  const r = await keuanganSvc.rekapKeuangan();
  if (r.jumlahTransaksi === 0) return ctx.reply("Belum ada data keuangan bulan ini.");
  ctx.reply(
    `💰 *Rekap Bulan Ini*\n\nPemasukan: ${formatRupiah(r.totalPemasukan)}\nPengeluaran: ${formatRupiah(r.totalPengeluaran)}\nSaldo bersih: *${formatRupiah(r.saldoBersih)}*\n\n_${r.jumlahTransaksi} transaksi_`,
    { parse_mode: "Markdown" }
  );
});
bot.action("aksi:grafik", async (ctx) => { await ctx.answerCbQuery(); await kirimGrafik(ctx); });
bot.action("aksi:list_masuk", async (ctx) => { await ctx.answerCbQuery(); await kirimListKeuangan(ctx, "pemasukan"); });
bot.action("aksi:list_keluar", async (ctx) => { await ctx.answerCbQuery(); await kirimListKeuangan(ctx, "pengeluaran"); });
bot.action("aksi:stok_rendah", async (ctx) => { await ctx.answerCbQuery(); await kirimStokRendah(ctx); });
bot.action("aksi:transaksi_terbaru", async (ctx) => {
  await ctx.answerCbQuery();
  await tampilkanDaftarTransaksi(ctx, await transaksiSvc.transaksiTerbaru(15));
});

// ==================== BROWSE KATEGORI -> MEREK -> LIST -> DETAIL ====================
bot.action("aksi:browse_kategori", async (ctx) => { await ctx.answerCbQuery(); await kirimDaftarKategori(ctx); });
bot.action("aksi:browse_merek", async (ctx) => { await ctx.answerCbQuery(); await kirimDaftarMerek(ctx, null); });

bot.action(/^pilihkategori:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const s = getSesi(ctx.from.id);
  const item = s.kategoriList?.[parseInt(ctx.match[1])];
  if (!item) return ctx.reply("Sesi kedaluwarsa, coba ulangi dari menu ya.");
  await kirimDaftarMerek(ctx, item.kategori);
});
bot.action(/^pilihmerek:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const s = getSesi(ctx.from.id);
  const item = s.merekList?.[parseInt(ctx.match[1])];
  if (!item) return ctx.reply("Sesi kedaluwarsa, coba ulangi dari menu ya.");
  await kirimBarangByFilter(ctx, { kategori: s.kategoriTerpilih || null, merek: item.merek === "Lainnya" ? null : item.merek });
});
bot.action("lihat_semua_merek_kategori", async (ctx) => {
  await ctx.answerCbQuery();
  const s = getSesi(ctx.from.id);
  await kirimBarangByFilter(ctx, { kategori: s.kategoriTerpilih || null, merek: null });
});

// tap angka -> detail
bot.action(/^detailbrg:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const s = getSesi(ctx.from.id);
  const b = s.barangList?.[parseInt(ctx.match[1])];
  if (!b) return ctx.reply("Sesi kedaluwarsa, coba cari ulang ya.");
  await ctx.reply(detailBarangLengkap(b), { parse_mode: "Markdown", ...tombolItemBarang(b.id) });
});
bot.action(/^detailk:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const s = getSesi(ctx.from.id);
  const k = s.keuanganList?.[parseInt(ctx.match[1])];
  if (!k) return ctx.reply("Sesi kedaluwarsa, coba lihat ulang ya.");
  await ctx.reply(barisKeuangan(k), { parse_mode: "Markdown", ...tombolItemKeuangan(k.id) });
});
bot.action(/^detailtrx:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const s = getSesi(ctx.from.id);
  const t = s.transaksiList?.[parseInt(ctx.match[1])];
  if (!t) return ctx.reply("Sesi kedaluwarsa, coba cari ulang ya.");
  await ctx.reply(teksInvoiceLengkap(t), { parse_mode: "Markdown" });
});

// ==================== MINTA INPUT ====================
bot.action("input:masuk", async (ctx) => { await ctx.answerCbQuery(); getSesi(ctx.from.id).menunggu = "jumlah_masuk"; ctx.reply("Baik. Ketik nominal & keterangan pemasukan.\nContoh: *350rb servis AC pak budi*", { parse_mode: "Markdown" }); });
bot.action("input:keluar", async (ctx) => { await ctx.answerCbQuery(); getSesi(ctx.from.id).menunggu = "jumlah_keluar"; ctx.reply("Baik. Ketik nominal & keterangan pengeluaran.\nContoh: *30rb bensin*", { parse_mode: "Markdown" }); });
bot.action("input:cari_barang", async (ctx) => { await ctx.answerCbQuery(); getSesi(ctx.from.id).menunggu = "cari_barang"; ctx.reply("Ketik nama barang yang ingin dicari:"); });
bot.action("input:cari_transaksi", async (ctx) => { await ctx.answerCbQuery(); getSesi(ctx.from.id).menunggu = "cari_transaksi"; ctx.reply("Ketik nama pelanggan, nomor nota, atau nama barang:"); });
bot.action("input:tanggal_transaksi", async (ctx) => { await ctx.answerCbQuery(); getSesi(ctx.from.id).menunggu = "tanggal_transaksi"; ctx.reply("Ketik tanggalnya, format: *YYYY-MM-DD*\nContoh: 2026-07-01", { parse_mode: "Markdown" }); });
bot.action("input:tambah_barang", async (ctx) => {
  await ctx.answerCbQuery();
  getSesi(ctx.from.id).tambahBarang = { langkah: 0, data: {} };
  ctx.reply("Tambah barang baru.\nKetik *merek & model* barang (contoh: Freon R32):", { parse_mode: "Markdown" });
});

// ==================== HAPUS (konfirmasi) ====================
bot.action(/^hapusk:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const id = ctx.match[1];
  const data = await keuanganSvc.ambilKeuanganById(id);
  if (!data) return ctx.reply("Data tidak ditemukan (mungkin sudah dihapus).");
  ctx.reply(`Yakin hapus catatan ini?\n\n${barisKeuangan(data)}`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("✅ Ya, hapus", `yhapusk:${id}`), Markup.button.callback("❌ Batal", "batal_aksi")]]),
  });
});
bot.action(/^yhapusk:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const hasil = await keuanganSvc.hapusKeuangan(ctx.match[1]);
  if (!hasil) return ctx.editMessageText("Data tidak ditemukan.");
  await ctx.editMessageText(`🗑️ Terhapus: ${formatRupiah(hasil.jumlah)} (${hasil.keterangan})\n_Masih tersimpan di arsip, bisa dikembalikan._`, { parse_mode: "Markdown" });
});
bot.action(/^hapusb:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const id = ctx.match[1];
  const data = await barangSvc.ambilBarangById(id);
  if (!data) return ctx.reply("Barang tidak ditemukan.");
  ctx.reply(`Yakin hapus barang ini?\n\n${barisBarang(data)}`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("✅ Ya, hapus", `yhapusb:${id}`), Markup.button.callback("❌ Batal", "batal_aksi")]]),
  });
});
bot.action(/^yhapusb:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const hasil = await barangSvc.hapusBarang(ctx.match[1]);
  if (!hasil) return ctx.editMessageText("Barang tidak ditemukan.");
  await ctx.editMessageText(`🗑️ Terhapus: ${hasil.merek} ${hasil.model}\n_Masih tersimpan di arsip._`, { parse_mode: "Markdown" });
});
bot.action("batal_aksi", async (ctx) => { await ctx.answerCbQuery("Dibatalkan"); await ctx.editMessageText("Baik, dibatalkan. 👍"); });

// ==================== EDIT (pilih field) ====================
bot.action(/^editk:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const id = ctx.match[1];
  ctx.reply("Mau ubah apa?", Markup.inlineKeyboard([
    [Markup.button.callback("Jumlah", `fk:jumlah:${id}`), Markup.button.callback("Keterangan", `fk:keterangan:${id}`)],
    [Markup.button.callback("Kategori", `fk:kategori:${id}`), Markup.button.callback("❌ Batal", "batal_aksi")],
  ]));
});
bot.action(/^fk:(\w+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, field, id] = ctx.match;
  const s = getSesi(ctx.from.id);
  s.menunggu = "nilai_edit_keuangan";
  s.editKeuangan = { id, field };
  ctx.reply(`Ketik nilai baru untuk *${field}*:`, { parse_mode: "Markdown" });
});
bot.action(/^editb:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const id = ctx.match[1];
  ctx.reply("Mau ubah apa?", Markup.inlineKeyboard([
    [Markup.button.callback("Harga", `fb:harga:${id}`), Markup.button.callback("Stok", `fb:stok:${id}`)],
    [Markup.button.callback("Merek", `fb:merek:${id}`), Markup.button.callback("Model", `fb:model:${id}`)],
    [Markup.button.callback("❌ Batal", "batal_aksi")],
  ]));
});
bot.action(/^fb:(\w+):(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const [, field, id] = ctx.match;
  const s = getSesi(ctx.from.id);
  s.menunggu = "nilai_edit_barang";
  s.editBarang = { id, field };
  ctx.reply(`Ketik nilai baru untuk *${field}*:`, { parse_mode: "Markdown" });
});

// ==================== COMMAND (tetap didukung) ====================
bot.command("transaksi", async (ctx) => {
  const kata = ctx.message.text.split(" ").slice(1).join(" ");
  if (!kata) return ctx.reply("Ketik: /transaksi <pelanggan/nota/barang>");
  await tampilkanDaftarTransaksi(ctx, await transaksiSvc.cariTransaksi(kata));
});
bot.command("invoice", async (ctx) => {
  const nota = ctx.message.text.split(" ").slice(1).join(" ");
  if (!nota) return ctx.reply("Ketik: /invoice <nomor nota>");
  const t = await transaksiSvc.ambilInvoice(nota);
  if (!t) return ctx.reply("Nota tidak ditemukan.");
  await ctx.reply(teksInvoiceLengkap(t), { parse_mode: "Markdown" });
});
bot.command("tanggal", async (ctx) => {
  const tgl = ctx.message.text.split(" ")[1];
  if (!tgl) return ctx.reply("Ketik: /tanggal <YYYY-MM-DD>");
  await tampilkanDaftarTransaksi(ctx, await transaksiSvc.transaksiByTanggal(tgl));
});
bot.command("kategori", (ctx) => kirimDaftarKategori(ctx));
bot.command("merek", (ctx) => kirimDaftarMerek(ctx, null));

// ==================== HELPER: KIRIM LIST KONSOLIDASI (1 pesan + tombol angka) ====================
async function kirimListKeuangan(ctx, jenis) {
  const daftar = await keuanganSvc.riwayatKeuangan(jenis, 15);
  if (daftar.length === 0) return ctx.reply(`Belum ada ${jenis}.`);
  getSesi(ctx.from.id).keuanganList = daftar;

  const judul = jenis === "pemasukan" ? "🟢 Pemasukan Terakhir" : "🔴 Pengeluaran Terakhir";
  const teks = daftar.map(keuanganSingkat).join("\n");
  const tombol = tombolGridAngka(daftar.length, "detailk");
  await ctx.reply(`*${judul}*\n\n${teks}\n\n_Tap angka buat lihat detail & edit/hapus._`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(tombol) });
}

async function kirimGrafik(ctx) {
  const r = await keuanganSvc.rekapKeuangan();
  if (r.jumlahTransaksi === 0) return ctx.reply("Belum ada data keuangan bulan ini.");
  const konfig = {
    type: "bar",
    data: { labels: ["Pemasukan", "Pengeluaran"], datasets: [{ label: "Rupiah", data: [r.totalPemasukan, r.totalPengeluaran], backgroundColor: ["#2ecc71", "#e74c3c"] }] },
    options: { plugins: { title: { display: true, text: "Pemasukan vs Pengeluaran Bulan Ini" } } },
  };
  await ctx.replyWithPhoto(`https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(konfig))}`);
}

async function kirimStokRendah(ctx) {
  const daftar = await barangSvc.stokRendah(30);
  if (daftar.length === 0) return ctx.reply("Aman, tidak ada stok yang menipis. 👍");
  getSesi(ctx.from.id).barangList = daftar;

  const teks = daftar.map(barangSingkat).join("\n");
  const tombol = tombolGridAngka(daftar.length, "detailbrg");
  await ctx.reply(`⚠️ *Stok Menipis* (${daftar.length} item)\n\n${teks}\n\n_Tap angka buat lihat detail & edit/hapus._`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(tombol) });
}

async function tampilkanHasilBarang(ctx, hasil) {
  if (hasil.length === 0) return ctx.reply("Barang tidak ditemukan.");
  if (hasil.length === 1) {
    return ctx.reply(detailBarangLengkap(hasil[0]), { parse_mode: "Markdown", ...tombolItemBarang(hasil[0].id) });
  }
  getSesi(ctx.from.id).barangList = hasil;
  const teks = hasil.map(barangSingkat).join("\n");
  const tombol = tombolGridAngka(hasil.length, "detailbrg");
  await ctx.reply(`📦 Ditemukan ${hasil.length} barang:\n\n${teks}\n\n_Tap angka buat lihat detail._`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(tombol) });
}

async function tampilkanDaftarTransaksi(ctx, daftar) {
  if (!daftar || daftar.length === 0) return ctx.reply("Transaksi tidak ditemukan.");
  if (daftar.length === 1) {
    return ctx.reply(teksInvoiceLengkap(daftar[0]), { parse_mode: "Markdown" });
  }
  getSesi(ctx.from.id).transaksiList = daftar;
  const teks = daftar.map(transaksiSingkat).join("\n");
  const tombol = tombolGridAngka(daftar.length, "detailtrx");
  await ctx.reply(`🧾 Ditemukan ${daftar.length} transaksi:\n\n${teks}\n\n_Tap angka buat lihat invoice lengkap._`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(tombol) });
}

async function kirimDaftarKategori(ctx) {
  const daftar = await barangSvc.daftarKategori();
  if (daftar.length === 0) return ctx.reply("Belum ada barang tercatat.");
  const s = getSesi(ctx.from.id);
  s.kategoriList = daftar;
  s.kategoriTerpilih = null;

  const tombol = daftar.map((k, i) => [Markup.button.callback(`${k.kategori} (${k.jumlah})`, `pilihkategori:${i}`)]);
  tombol.push([Markup.button.callback("« Kembali", "menu:barang")]);
  await ctx.reply("📂 Pilih kategori:", Markup.inlineKeyboard(tombol));
}

async function kirimDaftarMerek(ctx, kategori) {
  const daftar = await barangSvc.daftarMerek(kategori);
  if (daftar.length === 0) return ctx.reply(kategori ? `Belum ada barang di kategori ${kategori}.` : "Belum ada barang tercatat.");

  const s = getSesi(ctx.from.id);
  s.merekList = daftar;
  s.kategoriTerpilih = kategori;

  const tombol = daftar.map((m, i) => [Markup.button.callback(`${m.merek} (${m.jumlah})`, `pilihmerek:${i}`)]);
  if (kategori) tombol.push([Markup.button.callback("📋 Lihat Semua di Kategori Ini", "lihat_semua_merek_kategori")]);
  tombol.push([Markup.button.callback("« Kembali", "menu:barang")]);

  const judul = kategori ? `🏷️ Merek untuk kategori *${kategori}*:` : "🏷️ Pilih merek:";
  await ctx.reply(judul, { parse_mode: "Markdown", ...Markup.inlineKeyboard(tombol) });
}

async function kirimBarangByFilter(ctx, { kategori, merek }) {
  const daftar = await barangSvc.barangByFilter({ kategori, merek }, 40);
  if (daftar.length === 0) return ctx.reply("Tidak ada barang yang cocok.");

  getSesi(ctx.from.id).barangList = daftar;
  const judul = [kategori, merek].filter(Boolean).join(" - ") || "Semua barang";
  const teks = daftar.map(barangSingkat).join("\n");
  const tombol = tombolGridAngka(daftar.length, "detailbrg");
  await ctx.reply(`📦 *${judul}* (${daftar.length} item):\n\n${teks}\n\n_Tap angka buat lihat detail._`, { parse_mode: "Markdown", ...Markup.inlineKeyboard(tombol) });
}

// ==================== TEXT HANDLER ====================
bot.on("text", async (ctx) => {
  const teks = ctx.message.text;
  if (teks.startsWith("/")) return;
  const s = getSesi(ctx.from.id);

  if (s.menunggu === "jumlah_masuk" || s.menunggu === "jumlah_keluar") {
    const jenis = s.menunggu === "jumlah_masuk" ? "pemasukan" : "pengeluaran";
    const bagian = teks.split(" ");
    const jumlah = parseJumlah(bagian[0]);
    const keterangan = bagian.slice(1).join(" ");
    resetSesi(ctx.from.id);
    if (!jumlah) return ctx.reply("Nominalnya belum kebaca. Coba lagi, contoh: *350rb servis AC*", { parse_mode: "Markdown" });
    const h = await keuanganSvc.catatKeuangan({ jenis, jumlah, keterangan });
    return ctx.reply(`Baik, sudah dicatat. ${tandaJenis(jenis)}\n\n${barisKeuangan(h)}`, { parse_mode: "Markdown", ...tombolItemKeuangan(h.id) });
  }
  if (s.menunggu === "cari_barang") { resetSesi(ctx.from.id); return tampilkanHasilBarang(ctx, await barangSvc.cariBarang(teks)); }
  if (s.menunggu === "cari_transaksi") { resetSesi(ctx.from.id); return tampilkanDaftarTransaksi(ctx, await transaksiSvc.cariTransaksi(teks)); }
  if (s.menunggu === "tanggal_transaksi") { resetSesi(ctx.from.id); return tampilkanDaftarTransaksi(ctx, await transaksiSvc.transaksiByTanggal(teks.trim())); }
  if (s.menunggu === "nilai_edit_keuangan") {
    const { id, field } = s.editKeuangan;
    resetSesi(ctx.from.id);
    const nilai = field === "jumlah" ? parseJumlah(teks) : teks;
    const hasil = await keuanganSvc.editKeuangan(id, { [field]: nilai });
    if (!hasil) return ctx.reply("Datanya tidak ditemukan.");
    return ctx.reply(`Baik, sudah diperbarui. ✅\n\n${barisKeuangan(hasil)}`, { parse_mode: "Markdown", ...tombolItemKeuangan(hasil.id) });
  }
  if (s.menunggu === "nilai_edit_barang") {
    const { id, field } = s.editBarang;
    resetSesi(ctx.from.id);
    const nilai = ["harga", "hargaBeli", "stok", "stokMinimal"].includes(field) ? parseJumlah(teks) : teks;
    const hasil = await barangSvc.editBarang(id, { [field]: nilai });
    if (!hasil) return ctx.reply("Barangnya tidak ditemukan.");
    return ctx.reply(`Baik, sudah diperbarui. ✅\n\n${barisBarang(hasil)}`, { parse_mode: "Markdown", ...tombolItemBarang(hasil.id) });
  }
  if (s.tambahBarang) return lanjutTambahBarang(ctx, s.tambahBarang, teks);

  await ctx.sendChatAction("typing");
  const { aksi, data } = await parsePesan(teks);

  switch (aksi) {
    case "tambah_keuangan": {
      if (!data.jumlah || !data.jenis) return ctx.reply("Maaf, nominal atau jenisnya kurang jelas. Contoh: *\"servis AC dapet 350rb\"*", { parse_mode: "Markdown" });
      const h = await keuanganSvc.catatKeuangan({ jenis: data.jenis, jumlah: parseJumlah(data.jumlah), keterangan: data.keterangan });
      return ctx.reply(`Baik, sudah dicatat. ${tandaJenis(h.jenis)}\n\n${barisKeuangan(h)}`, { parse_mode: "Markdown", ...tombolItemKeuangan(h.id) });
    }
    case "rekap_keuangan": {
      const r = await keuanganSvc.rekapKeuangan();
      if (r.jumlahTransaksi === 0) return ctx.reply("Belum ada data keuangan bulan ini.");
      return ctx.reply(`💰 *Bulan ini*\nPemasukan ${formatRupiah(r.totalPemasukan)}\nPengeluaran ${formatRupiah(r.totalPengeluaran)}\nSaldo *${formatRupiah(r.saldoBersih)}*`, { parse_mode: "Markdown" });
    }
    case "riwayat_keuangan": return kirimListKeuangan(ctx, data.jenis || "pemasukan");
    case "cari_barang": return tampilkanHasilBarang(ctx, await barangSvc.cariBarang(data.kataKunci || ""));
    case "daftar_kategori": return kirimDaftarKategori(ctx);
    case "daftar_merek": return kirimDaftarMerek(ctx, data.kategori || null);
    case "tambah_barang": {
      const h = await barangSvc.tambahBarang(data);
      return ctx.reply(`Baik, barang sudah ditambahkan. ✅\n\n${barisBarang(h)}`, { parse_mode: "Markdown", ...tombolItemBarang(h.id) });
    }
    case "stok_rendah": return kirimStokRendah(ctx);
    case "cari_transaksi": return tampilkanDaftarTransaksi(ctx, await transaksiSvc.cariTransaksi(data.kataKunci || ""));
    default:
      return ctx.reply("Maaf, saya belum paham maksudnya. 🙏 Coba lebih spesifik, atau pakai menu di bawah.", menuUtama());
  }
});

async function lanjutTambahBarang(ctx, alur, teks) {
  if (alur.langkah === 0) {
    const [merek, ...model] = teks.split(" ");
    alur.data.merek = merek;
    alur.data.model = model.join(" ");
    alur.langkah = 1;
    return ctx.reply("Kategorinya apa? (contoh: Freon, Kapasitor, Unit)");
  }
  if (alur.langkah === 1) {
    alur.data.kategori = teks;
    alur.langkah = 2;
    return ctx.reply("Harga jualnya berapa? (contoh: 150rb)");
  }
  if (alur.langkah === 2) {
    alur.data.harga = parseJumlah(teks);
    alur.langkah = 3;
    return ctx.reply("Stok awalnya berapa? (contoh: 10)");
  }
  if (alur.langkah === 3) {
    alur.data.stok = parseInt(teks) || 0;
    const h = await barangSvc.tambahBarang(alur.data);
    resetSesi(ctx.from.id);
    return ctx.reply(`Baik, barang sudah ditambahkan. ✅\n\n${barisBarang(h)}`, { parse_mode: "Markdown", ...tombolItemBarang(h.id) });
  }
}

// ==================== LAUNCH ====================
bot.catch((err, ctx) => {
  console.error("Error:", err.message);
  if (ctx && ctx.reply) ctx.reply("Maaf, sedang ada gangguan. Coba lagi sebentar ya. 🙏").catch(() => {});
});

bot.launch();
console.log("Bot HDB (interaktif) jalan...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
