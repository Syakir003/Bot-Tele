require("dotenv").config();

const { Telegraf } = require("telegraf");
const dayjs = require("dayjs");

const { formatRupiah, parseJumlah } = require("./services/util");
const { parsePesan } = require("./services/parser");
const barangSvc = require("./services/barang");
const keuanganSvc = require("./services/keuangan");
const transaksiSvc = require("./services/transaksi");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const OWNER_ID = process.env.OWNER_TELEGRAM_ID;

// Guard: cuma owner yang boleh
bot.use((ctx, next) => {
  if (OWNER_ID && String(ctx.from?.id || "") !== String(OWNER_ID)) return;
  return next();
});

// ========================= HELPER TAMPILAN =========================
function barisBarang(b) {
  return `📦 ${b.merek} ${b.model}\n   Harga: ${formatRupiah(b.harga)} | Stok: ${b.stok} ${b.satuan || ""}\n   id: ${b.id}`;
}

function barisKeuangan(k) {
  const tanda = k.jenis === "pemasukan" ? "🟢" : "🔴";
  return `${tanda} ${dayjs(k.tanggal).format("DD MMM")} — ${formatRupiah(k.jumlah)}\n   ${k.keterangan || k.kategori}\n   id: ${k.id}`;
}

// ========================= UMUM =========================
bot.start((ctx) =>
  ctx.reply(
    "Halo! Aku bot manajemen keuangan & barang HDB 🧾\nKetik /help buat liat semua perintah.",
  ),
);

bot.command("myid", (ctx) => ctx.reply(`ID Telegram kamu: ${ctx.from.id}`));

bot.help((ctx) =>
  ctx.reply(
    "📋 DAFTAR PERINTAH\n\n" +
      "— BARANG —\n" +
      "/barang <kata> — cari barang\n" +
      "/tambah_barang — tambah barang (dipandu)\n" +
      "/edit_barang <id> <field> <nilai> — edit\n" +
      "/hapus_barang <id> — hapus (bisa dibalikin)\n" +
      "/stok_rendah — barang stok menipis\n\n" +
      "— KEUANGAN —\n" +
      "/keuangan — rekap bulan ini\n" +
      "/masuk <jumlah> <ket> — catat pemasukan\n" +
      "/keluar <jumlah> <ket> — catat pengeluaran\n" +
      "/pemasukan — 10 pemasukan terakhir\n" +
      "/pengeluaran — 10 pengeluaran terakhir\n" +
      "/edit_keuangan <id> <field> <nilai> — edit\n" +
      "/hapus_keuangan <id> — hapus (bisa dibalikin)\n" +
      "/grafik — chart pemasukan vs pengeluaran\n\n" +
      "— TRANSAKSI (nota) —\n" +
      "/transaksi <kata> — cari transaksi\n" +
      "/invoice <nomor nota> — detail invoice\n" +
      "/tanggal <YYYY-MM-DD> — transaksi per tanggal\n\n" +
      'Atau ketik bebas, misal: "catat pemasukan 500rb servis AC" atau "cek stok freon".',
  ),
);

// ========================= BARANG =========================
bot.command("barang", async (ctx) => {
  const kata = ctx.message.text.split(" ").slice(1).join(" ");
  if (!kata)
    return ctx.reply("Ketik: /barang <kata kunci>\nContoh: /barang freon");

  const hasil = await barangSvc.cariBarang(kata);
  if (hasil.length === 0) return ctx.reply("Barang ga ketemu.");
  ctx.reply(hasil.map(barisBarang).join("\n\n"));
});

bot.command("stok_rendah", async (ctx) => {
  const hasil = await barangSvc.stokRendah();
  if (hasil.length === 0)
    return ctx.reply("Aman, ga ada barang yang stoknya menipis. 👍");
  ctx.reply(
    "⚠️ Barang stok menipis:\n\n" + hasil.map(barisBarang).join("\n\n"),
  );
});

// tambah barang dipandu (multi-step sederhana pakai session in-memory)
const sesiTambahBarang = {};
bot.command("tambah_barang", (ctx) => {
  sesiTambahBarang[ctx.from.id] = { langkah: 0, data: {} };
  ctx.reply(
    "Tambah barang baru.\nKetik merek & model barang (contoh: Freon R32):\n\n(ketik /batal buat batal)",
  );
});

bot.command("edit_barang", async (ctx) => {
  const [, id, field, ...sisa] = ctx.message.text.split(" ");
  const nilai = sisa.join(" ");
  if (!id || !field || !nilai) {
    return ctx.reply(
      "Ketik: /edit_barang <id> <field> <nilai>\nContoh: /edit_barang -Nabc123 harga 150000\n\nField: merek, model, kategori, harga, hargaBeli, stok, stokMinimal, satuan, keterangan",
    );
  }

  const nilaiFix = ["harga", "hargaBeli", "stok", "stokMinimal"].includes(field)
    ? parseJumlah(nilai)
    : nilai;
  const hasil = await barangSvc.editBarang(id, { [field]: nilaiFix });
  if (!hasil) return ctx.reply("Barang dengan id itu ga ketemu.");
  ctx.reply("✅ Diupdate:\n\n" + barisBarang(hasil));
});

bot.command("hapus_barang", async (ctx) => {
  const id = ctx.message.text.split(" ")[1];
  if (!id) return ctx.reply("Ketik: /hapus_barang <id>");

  const hasil = await barangSvc.hapusBarang(id);
  if (!hasil) return ctx.reply("Barang dengan id itu ga ketemu.");
  ctx.reply(
    `🗑️ Dihapus: ${hasil.merek} ${hasil.model}\n(masih tersimpan di arsip, bisa dibalikin manual kalau perlu)`,
  );
});

// ========================= KEUANGAN =========================
bot.command("keuangan", async (ctx) => {
  const r = await keuanganSvc.rekapKeuangan();
  if (r.jumlahTransaksi === 0)
    return ctx.reply("Belum ada data keuangan bulan ini.");
  ctx.reply(
    `💰 Rekap Keuangan Bulan Ini\n\n` +
      `Pemasukan: ${formatRupiah(r.totalPemasukan)}\n` +
      `Pengeluaran: ${formatRupiah(r.totalPengeluaran)}\n` +
      `Saldo bersih: ${formatRupiah(r.saldoBersih)}\n\n(${r.jumlahTransaksi} transaksi)`,
  );
});

bot.command("masuk", async (ctx) => {
  const teks = ctx.message.text.split(" ").slice(1);
  const jumlah = parseJumlah(teks[0]);
  const keterangan = teks.slice(1).join(" ");
  if (!jumlah)
    return ctx.reply(
      "Ketik: /masuk <jumlah> <keterangan>\nContoh: /masuk 500rb servis AC pak budi",
    );

  const h = await keuanganSvc.catatKeuangan({
    jenis: "pemasukan",
    jumlah,
    keterangan,
  });
  ctx.reply(
    `✅ Pemasukan: ${formatRupiah(h.jumlah)}\n${h.keterangan}\nid: ${h.id}`,
  );
});

bot.command("keluar", async (ctx) => {
  const teks = ctx.message.text.split(" ").slice(1);
  const jumlah = parseJumlah(teks[0]);
  const keterangan = teks.slice(1).join(" ");
  if (!jumlah)
    return ctx.reply(
      "Ketik: /keluar <jumlah> <keterangan>\nContoh: /keluar 30rb bensin",
    );

  const h = await keuanganSvc.catatKeuangan({
    jenis: "pengeluaran",
    jumlah,
    keterangan,
  });
  ctx.reply(
    `✅ Pengeluaran: ${formatRupiah(h.jumlah)}\n${h.keterangan}\nid: ${h.id}`,
  );
});

bot.command("pemasukan", async (ctx) => {
  const daftar = await keuanganSvc.riwayatKeuangan("pemasukan");
  if (daftar.length === 0) return ctx.reply("Belum ada pemasukan.");
  ctx.reply(
    "💵 10 Pemasukan Terakhir:\n\n" + daftar.map(barisKeuangan).join("\n\n"),
  );
});

bot.command("pengeluaran", async (ctx) => {
  const daftar = await keuanganSvc.riwayatKeuangan("pengeluaran");
  if (daftar.length === 0) return ctx.reply("Belum ada pengeluaran.");
  ctx.reply(
    "💸 10 Pengeluaran Terakhir:\n\n" + daftar.map(barisKeuangan).join("\n\n"),
  );
});

bot.command("edit_keuangan", async (ctx) => {
  const [, id, field, ...sisa] = ctx.message.text.split(" ");
  const nilai = sisa.join(" ");
  if (!id || !field || !nilai) {
    return ctx.reply(
      "Ketik: /edit_keuangan <id> <field> <nilai>\nField: jenis, jumlah, kategori, keterangan, tanggal",
    );
  }
  const nilaiFix = field === "jumlah" ? parseJumlah(nilai) : nilai;
  const hasil = await keuanganSvc.editKeuangan(id, { [field]: nilaiFix });
  if (!hasil) return ctx.reply("Data keuangan dengan id itu ga ketemu.");
  ctx.reply("✅ Diupdate:\n\n" + barisKeuangan(hasil));
});

// simpan pilihan sementara per user
const sesiHapusKeuangan = {};

bot.command("hapus_keuangan", async (ctx) => {
  const daftar = await keuanganSvc.riwayatKeuangan(null, 10);
  if (daftar.length === 0) return ctx.reply("Belum ada data keuangan.");

  sesiHapusKeuangan[ctx.from.id] = daftar;

  const pesan = daftar
    .map((k, i) => {
      const tanda = k.jenis === "pemasukan" ? "🟢" : "🔴";
      return `${i + 1}. ${tanda} ${dayjs(k.tanggal).format("DD MMM")} — ${formatRupiah(k.jumlah)} (${k.keterangan || k.kategori})`;
    })
    .join("\n");

  ctx.reply(
    `Mau hapus yang mana? Balas angkanya (1-${daftar.length}):\n\n${pesan}\n\n(ketik /batal buat batal)`,
  );
});

bot.command("grafik", async (ctx) => {
  const r = await keuanganSvc.rekapKeuangan();
  if (r.jumlahTransaksi === 0)
    return ctx.reply("Belum ada data keuangan bulan ini.");

  const konfig = {
    type: "bar",
    data: {
      labels: ["Pemasukan", "Pengeluaran"],
      datasets: [
        {
          label: "Rupiah",
          data: [r.totalPemasukan, r.totalPengeluaran],
          backgroundColor: ["#2ecc71", "#e74c3c"],
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: "Pemasukan vs Pengeluaran Bulan Ini" },
      },
    },
  };
  const url = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(konfig))}`;
  await ctx.replyWithPhoto(url);
});

// ========================= TRANSAKSI (read-only) =========================
bot.command("transaksi", async (ctx) => {
  const kata = ctx.message.text.split(" ").slice(1).join(" ");
  if (!kata) return ctx.reply("Ketik: /transaksi <pelanggan/nota/barang>");

  const hasil = await transaksiSvc.cariTransaksi(kata);
  if (hasil.length === 0) return ctx.reply("Transaksi ga ketemu.");
  ctx.reply(
    hasil
      .map(
        (t) =>
          `${dayjs(t.tanggal).format("DD MMM YYYY")} — ${t.nomorNota || "-"}\nPelanggan: ${t.pelanggan || "-"}\nTotal: ${formatRupiah(t.total)}`,
      )
      .join("\n\n"),
  );
});

bot.command("invoice", async (ctx) => {
  const nota = ctx.message.text.split(" ").slice(1).join(" ");
  if (!nota) return ctx.reply("Ketik: /invoice <nomor nota>");

  const t = await transaksiSvc.ambilInvoice(nota);
  if (!t) return ctx.reply("Nota ga ketemu.");

  const items = (t.items || [])
    .map(
      (it) =>
        `- ${it.barang?.merek || ""} ${it.barang?.model || ""} x${it.jumlah} @ ${formatRupiah(it.barang?.harga || 0)}`,
    )
    .join("\n");
  ctx.reply(
    `🧾 ${t.nomorNota}\n${dayjs(t.tanggal).format("DD MMM YYYY, HH:mm")}\nPelanggan: ${t.pelanggan || "-"}\n\n${items}\n\nTotal: ${formatRupiah(t.total)}\nBayar: ${formatRupiah(t.bayar)}\nKembali: ${formatRupiah(t.kembali)}`,
  );
});

bot.command("tanggal", async (ctx) => {
  const tgl = ctx.message.text.split(" ")[1];
  if (!tgl) return ctx.reply("Ketik: /tanggal <YYYY-MM-DD>");

  const daftar = await transaksiSvc.transaksiByTanggal(tgl);
  if (daftar.length === 0) return ctx.reply(`Ga ada transaksi tanggal ${tgl}.`);

  const total = daftar.reduce((s, t) => s + (t.total || 0), 0);
  ctx.reply(
    `📅 Transaksi ${tgl} (${daftar.length} nota)\n\n` +
      daftar
        .map(
          (t) =>
            `${t.nomorNota || "-"} — ${formatRupiah(t.total)} (${t.pelanggan || "-"})`,
        )
        .join("\n") +
      `\n\nTotal: ${formatRupiah(total)}`,
  );
});

bot.command("batal", (ctx) => {
  delete sesiTambahBarang[ctx.from.id];
  delete sesiHapusKeuangan[ctx.from.id];
  ctx.reply("Dibatalin.");
});

// ========================= NATURAL LANGUAGE =========================
bot.on("text", async (ctx) => {
  const teks = ctx.message.text;

  if (teks.startsWith("/")) return;
  // Lagi milih mau hapus keuangan yang mana?
  const daftarHapus = sesiHapusKeuangan[ctx.from.id];
  if (daftarHapus) {
    const nomor = parseInt(teks);
    if (isNaN(nomor) || nomor < 1 || nomor > daftarHapus.length) {
      return ctx.reply(`Balas angka 1-${daftarHapus.length} aja, atau /batal.`);
    }
    const target = daftarHapus[nomor - 1];
    delete sesiHapusKeuangan[ctx.from.id];
    const hasil = await keuanganSvc.hapusKeuangan(target.id);
    return ctx.reply(
      `🗑️ Dihapus: ${formatRupiah(hasil.jumlah)} (${hasil.keterangan})\n(masih di arsip, bisa dibalikin)`,
    );
  }

  // Lagi di tengah alur tambah barang?
  const sesi = sesiTambahBarang[ctx.from.id];
  if (sesi) return lanjutTambahBarang(ctx, sesi, teks);

  await ctx.sendChatAction("typing");
  const { aksi, data } = await parsePesan(teks);

  switch (aksi) {
    case "tambah_keuangan": {
      if (!data.jumlah || !data.jenis)
        return ctx.reply(
          'Kurang jelas jumlah/jenisnya. Contoh: "catat pemasukan 500rb servis AC".',
        );
      const h = await keuanganSvc.catatKeuangan({
        jenis: data.jenis,
        jumlah: parseJumlah(data.jumlah),
        keterangan: data.keterangan,
      });
      return ctx.reply(
        `✅ ${h.jenis === "pemasukan" ? "Pemasukan" : "Pengeluaran"}: ${formatRupiah(h.jumlah)}\n${h.keterangan}\nid: ${h.id}`,
      );
    }
    case "rekap_keuangan": {
      const r = await keuanganSvc.rekapKeuangan();
      if (r.jumlahTransaksi === 0)
        return ctx.reply("Belum ada data keuangan bulan ini.");
      return ctx.reply(
        `💰 Bulan ini:\nPemasukan ${formatRupiah(r.totalPemasukan)}\nPengeluaran ${formatRupiah(r.totalPengeluaran)}\nSaldo ${formatRupiah(r.saldoBersih)}`,
      );
    }
    case "riwayat_keuangan": {
      const daftar = await keuanganSvc.riwayatKeuangan(data.jenis || null);
      if (daftar.length === 0) return ctx.reply("Belum ada datanya.");
      return ctx.reply(daftar.map(barisKeuangan).join("\n\n"));
    }
    case "cari_barang": {
      const hasil = await barangSvc.cariBarang(data.kataKunci || "");
      if (hasil.length === 0) return ctx.reply("Barang ga ketemu.");
      return ctx.reply(hasil.map(barisBarang).join("\n\n"));
    }
    case "tambah_barang": {
      const h = await barangSvc.tambahBarang(data);
      return ctx.reply("✅ Barang ditambah:\n\n" + barisBarang(h));
    }
    case "stok_rendah": {
      const hasil = await barangSvc.stokRendah();
      if (hasil.length === 0) return ctx.reply("Aman, ga ada stok menipis. 👍");
      return ctx.reply(
        "⚠️ Stok menipis:\n\n" + hasil.map(barisBarang).join("\n\n"),
      );
    }
    case "cari_transaksi": {
      const hasil = await transaksiSvc.cariTransaksi(data.kataKunci || "");
      if (hasil.length === 0) return ctx.reply("Transaksi ga ketemu.");
      return ctx.reply(
        hasil
          .map(
            (t) =>
              `${dayjs(t.tanggal).format("DD MMM YYYY")} — ${t.nomorNota || "-"} (${formatRupiah(t.total)})`,
          )
          .join("\n"),
      );
    }
    default:
      return ctx.reply(
        "Maaf, kurang paham. Ketik /help buat liat perintah, atau coba lebih spesifik ya.",
      );
  }
});

// alur tambah barang dipandu
async function lanjutTambahBarang(ctx, sesi, teks) {
  const langkah = sesi.langkah;

  if (langkah === 0) {
    sesi.data.merekModel = teks;
    const [merek, ...model] = teks.split(" ");
    sesi.data.merek = merek;
    sesi.data.model = model.join(" ");
    sesi.langkah = 1;
    return ctx.reply("Kategori barang? (contoh: Freon, Kapasitor, Unit)");
  }
  if (langkah === 1) {
    sesi.data.kategori = teks;
    sesi.langkah = 2;
    return ctx.reply("Harga jual? (contoh: 150rb)");
  }
  if (langkah === 2) {
    sesi.data.harga = parseJumlah(teks);
    sesi.langkah = 3;
    return ctx.reply("Stok awal? (contoh: 10)");
  }
  if (langkah === 3) {
    sesi.data.stok = parseInt(teks) || 0;
    const h = await barangSvc.tambahBarang(sesi.data);
    delete sesiTambahBarang[ctx.from.id];
    return ctx.reply("✅ Barang ditambah:\n\n" + barisBarang(h));
  }
}

// ========================= LAUNCH =========================
bot.catch((err, ctx) => {
  console.error("Error:", err.message);
  if (ctx && ctx.reply)
    ctx.reply("Lagi ada gangguan, coba lagi ya 🙏").catch(() => {});
});

bot.launch();
console.log("Bot HDB jalan...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
