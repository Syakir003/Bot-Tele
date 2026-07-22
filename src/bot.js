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

// sesi per-user (untuk alur multi-langkah)
const sesi = {};
function getSesi(id) {
  if (!sesi[id]) sesi[id] = {};
  return sesi[id];
}
function resetSesi(id) {
  sesi[id] = {};
}

// guard owner
bot.use((ctx, next) => {
  if (OWNER_ID && String(ctx.from?.id || "") !== String(OWNER_ID)) return;
  return next();
});

// ==================== TAMPILAN ====================
function tandaJenis(j) {
  return j === "pemasukan" ? "🟢" : "🔴";
}

function barisBarang(b) {
  return `📦 *${b.merek} ${b.model}*\nHarga: ${formatRupiah(b.harga)}  •  Stok: ${b.stok} ${b.satuan || ""}`;
}

function barisKeuangan(k) {
  return `${tandaJenis(k.jenis)} ${dayjs(k.tanggal).format("DD MMM")} — *${formatRupiah(k.jumlah)}*\n${k.keterangan || k.kategori}`;
}

// menu utama
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
    [Markup.button.callback("🔍 Cari Barang", "input:cari_barang")],
    [Markup.button.callback("⚠️ Stok Menipis", "aksi:stok_rendah")],
    [Markup.button.callback("➕ Tambah Barang", "input:tambah_barang")],
    [Markup.button.callback("« Kembali", "menu:utama")],
  ]);
}

// tombol edit/hapus untuk 1 item keuangan
function tombolItemKeuangan(id) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✏️ Edit", `editk:${id}`), Markup.button.callback("🗑️ Hapus", `hapusk:${id}`)],
  ]);
}

function tombolItemBarang(id) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✏️ Edit", `editb:${id}`), Markup.button.callback("🗑️ Hapus", `hapusb:${id}`)],
  ]);
}

// ==================== START / HELP ====================
bot.start((ctx) => {
  resetSesi(ctx.from.id);
  ctx.reply("Halo! 👋 Saya asisten keuangan & barang HDB Airconds.\n\nSilakan pilih menu di bawah, atau ketik langsung seperti *\"servis AC dapet 350rb\"* atau *\"cek stok freon\"*.", {
    parse_mode: "Markdown",
    ...menuUtama(),
  });
});

bot.command("menu", (ctx) => ctx.reply("Menu utama:", menuUtama()));
bot.command("myid", (ctx) => ctx.reply(`ID Telegram Anda: ${ctx.from.id}`));

bot.command("batal", (ctx) => {
  resetSesi(ctx.from.id);
  ctx.reply("Baik, dibatalkan. 👍", menuUtama());
});

// ==================== CALLBACK: NAVIGASI MENU ====================
bot.action("menu:utama", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("Menu utama:", menuUtama());
});
bot.action("menu:keuangan", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("💰 *Menu Keuangan*", { parse_mode: "Markdown", ...menuKeuangan() });
});
bot.action("menu:barang", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("📦 *Menu Barang*", { parse_mode: "Markdown", ...menuBarang() });
});
bot.action("menu:transaksi", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("🧾 Untuk transaksi, ketik:\n\n`/transaksi <nama/nota>`\n`/invoice <nomor nota>`\n`/tanggal <YYYY-MM-DD>`", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("« Kembali", "menu:utama")]]),
  });
});

// ==================== CALLBACK: AKSI LANGSUNG ====================
bot.action("aksi:rekap", async (ctx) => {
  await ctx.answerCbQuery();
  const r = await keuanganSvc.rekapKeuangan();
  if (r.jumlahTransaksi === 0) return ctx.reply("Belum ada data keuangan bulan ini.");
  ctx.reply(
    `💰 *Rekap Bulan Ini*\n\nPemasukan: ${formatRupiah(r.totalPemasukan)}\nPengeluaran: ${formatRupiah(r.totalPengeluaran)}\nSaldo bersih: *${formatRupiah(r.saldoBersih)}*\n\n_${r.jumlahTransaksi} transaksi_`,
    { parse_mode: "Markdown" }
  );
});

bot.action("aksi:grafik", async (ctx) => {
  await ctx.answerCbQuery();
  await kirimGrafik(ctx);
});

bot.action("aksi:list_masuk", async (ctx) => {
  await ctx.answerCbQuery();
  await kirimListKeuangan(ctx, "pemasukan");
});
bot.action("aksi:list_keluar", async (ctx) => {
  await ctx.answerCbQuery();
  await kirimListKeuangan(ctx, "pengeluaran");
});
bot.action("aksi:stok_rendah", async (ctx) => {
  await ctx.answerCbQuery();
  const hasil = await barangSvc.stokRendah();
  if (hasil.length === 0) return ctx.reply("Aman, tidak ada stok yang menipis. 👍");
  for (const b of hasil) {
    await ctx.reply(barisBarang(b), { parse_mode: "Markdown", ...tombolItemBarang(b.id) });
  }
});

// ==================== CALLBACK: MINTA INPUT ====================
bot.action("input:masuk", async (ctx) => {
  await ctx.answerCbQuery();
  getSesi(ctx.from.id).menunggu = "jumlah_masuk";
  ctx.reply("Baik. Ketik nominal & keterangan pemasukan.\nContoh: *350rb servis AC pak budi*", { parse_mode: "Markdown" });
});
bot.action("input:keluar", async (ctx) => {
  await ctx.answerCbQuery();
  getSesi(ctx.from.id).menunggu = "jumlah_keluar";
  ctx.reply("Baik. Ketik nominal & keterangan pengeluaran.\nContoh: *30rb bensin*", { parse_mode: "Markdown" });
});
bot.action("input:cari_barang", async (ctx) => {
  await ctx.answerCbQuery();
  getSesi(ctx.from.id).menunggu = "cari_barang";
  ctx.reply("Ketik nama barang yang ingin dicari:");
});
bot.action("input:tambah_barang", async (ctx) => {
  await ctx.answerCbQuery();
  const s = getSesi(ctx.from.id);
  s.tambahBarang = { langkah: 0, data: {} };
  ctx.reply("Tambah barang baru.\nKetik *merek & model* barang (contoh: Freon R32):", { parse_mode: "Markdown" });
});

// ==================== CALLBACK: HAPUS (dengan konfirmasi) ====================
bot.action(/^hapusk:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const id = ctx.match[1];
  const data = await keuanganSvc.ambilKeuanganById(id);
  if (!data) return ctx.reply("Data tidak ditemukan (mungkin sudah dihapus).");
  ctx.reply(
    `Yakin hapus catatan ini?\n\n${barisKeuangan(data)}`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Ya, hapus", `yhapusk:${id}`), Markup.button.callback("❌ Batal", "batal_aksi")],
      ]),
    }
  );
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
  ctx.reply(
    `Yakin hapus barang ini?\n\n${barisBarang(data)}`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Ya, hapus", `yhapusb:${id}`), Markup.button.callback("❌ Batal", "batal_aksi")],
      ]),
    }
  );
});
bot.action(/^yhapusb:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const hasil = await barangSvc.hapusBarang(ctx.match[1]);
  if (!hasil) return ctx.editMessageText("Barang tidak ditemukan.");
  await ctx.editMessageText(`🗑️ Terhapus: ${hasil.merek} ${hasil.model}\n_Masih tersimpan di arsip._`, { parse_mode: "Markdown" });
});

bot.action("batal_aksi", async (ctx) => {
  await ctx.answerCbQuery("Dibatalkan");
  await ctx.editMessageText("Baik, dibatalkan. 👍");
});

// ==================== CALLBACK: EDIT (pilih field) ====================
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

// ==================== COMMAND TRANSAKSI (read only) ====================
bot.command("transaksi", async (ctx) => {
  const kata = ctx.message.text.split(" ").slice(1).join(" ");
  if (!kata) return ctx.reply("Ketik: /transaksi <pelanggan/nota/barang>");
  const hasil = await transaksiSvc.cariTransaksi(kata);
  if (hasil.length === 0) return ctx.reply("Transaksi tidak ditemukan.");
  ctx.reply(hasil.map((t) => `${dayjs(t.tanggal).format("DD MMM YYYY")} — ${t.nomorNota || "-"}\n${t.pelanggan || "-"} • ${formatRupiah(t.total)}`).join("\n\n"));
});
bot.command("invoice", async (ctx) => {
  const nota = ctx.message.text.split(" ").slice(1).join(" ");
  if (!nota) return ctx.reply("Ketik: /invoice <nomor nota>");
  const t = await transaksiSvc.ambilInvoice(nota);
  if (!t) return ctx.reply("Nota tidak ditemukan.");
  const items = (t.items || []).map((it) => `- ${it.barang?.merek || ""} ${it.barang?.model || ""} x${it.jumlah} @ ${formatRupiah(it.barang?.harga || 0)}`).join("\n");
  ctx.reply(`🧾 ${t.nomorNota}\n${dayjs(t.tanggal).format("DD MMM YYYY, HH:mm")}\nPelanggan: ${t.pelanggan || "-"}\n\n${items}\n\nTotal: ${formatRupiah(t.total)}\nBayar: ${formatRupiah(t.bayar)}\nKembali: ${formatRupiah(t.kembali)}`);
});
bot.command("tanggal", async (ctx) => {
  const tgl = ctx.message.text.split(" ")[1];
  if (!tgl) return ctx.reply("Ketik: /tanggal <YYYY-MM-DD>");
  const daftar = await transaksiSvc.transaksiByTanggal(tgl);
  if (daftar.length === 0) return ctx.reply(`Tidak ada transaksi tanggal ${tgl}.`);
  const total = daftar.reduce((s, t) => s + (t.total || 0), 0);
  ctx.reply(`📅 Transaksi ${tgl} (${daftar.length} nota)\n\n` + daftar.map((t) => `${t.nomorNota || "-"} — ${formatRupiah(t.total)} (${t.pelanggan || "-"})`).join("\n") + `\n\nTotal: ${formatRupiah(total)}`);
});

// ==================== HELPER PENGIRIM ====================
async function kirimListKeuangan(ctx, jenis) {
  const daftar = await keuanganSvc.riwayatKeuangan(jenis);
  if (daftar.length === 0) return ctx.reply(`Belum ada ${jenis}.`);
  await ctx.reply(`${jenis === "pemasukan" ? "🟢 Pemasukan" : "🔴 Pengeluaran"} terakhir:`);
  for (const k of daftar) {
    await ctx.reply(barisKeuangan(k), { parse_mode: "Markdown", ...tombolItemKeuangan(k.id) });
  }
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

async function tampilkanHasilBarang(ctx, hasil) {
  if (hasil.length === 0) return ctx.reply("Barang tidak ditemukan.");
  for (const b of hasil) {
    await ctx.reply(barisBarang(b), { parse_mode: "Markdown", ...tombolItemBarang(b.id) });
  }
}

// ==================== TEXT HANDLER (sesi + natural language) ====================
bot.on("text", async (ctx) => {
  const teks = ctx.message.text;
  if (teks.startsWith("/")) return;
  const s = getSesi(ctx.from.id);

  // --- alur menunggu input dari tombol ---
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

  if (s.menunggu === "cari_barang") {
    resetSesi(ctx.from.id);
    const hasil = await barangSvc.cariBarang(teks);
    return tampilkanHasilBarang(ctx, hasil);
  }

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

  // --- alur tambah barang dipandu ---
  if (s.tambahBarang) {
    return lanjutTambahBarang(ctx, s.tambahBarang, teks);
  }

  // --- natural language ---
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
    case "riwayat_keuangan":
      return kirimListKeuangan(ctx, data.jenis || "pemasukan");
    case "cari_barang": {
      const hasil = await barangSvc.cariBarang(data.kataKunci || "");
      return tampilkanHasilBarang(ctx, hasil);
    }
    case "tambah_barang": {
      const h = await barangSvc.tambahBarang(data);
      return ctx.reply(`Baik, barang sudah ditambahkan. ✅\n\n${barisBarang(h)}`, { parse_mode: "Markdown", ...tombolItemBarang(h.id) });
    }
    case "stok_rendah": {
      const hasil = await barangSvc.stokRendah();
      if (hasil.length === 0) return ctx.reply("Aman, tidak ada stok menipis. 👍");
      for (const b of hasil) await ctx.reply(barisBarang(b), { parse_mode: "Markdown", ...tombolItemBarang(b.id) });
      return;
    }
    case "cari_transaksi": {
      const hasil = await transaksiSvc.cariTransaksi(data.kataKunci || "");
      if (hasil.length === 0) return ctx.reply("Transaksi tidak ditemukan.");
      return ctx.reply(hasil.map((t) => `${dayjs(t.tanggal).format("DD MMM YYYY")} — ${t.nomorNota || "-"} (${formatRupiah(t.total)})`).join("\n"));
    }
    default:
      return ctx.reply("Maaf, saya belum paham maksudnya. 🙏 Coba lebih spesifik, atau pakai menu di bawah.", menuUtama());
  }
});

async function lanjutTambahBarang(ctx, alur, teks) {
  const s = getSesi(ctx.from.id);
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
