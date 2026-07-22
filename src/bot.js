require("dotenv").config();

const { Telegraf } = require("telegraf");
const cron = require("node-cron");
const dayjs = require("dayjs");

const { modelUtama } = require("./config/gemini");
const { klasifikasiPesan } = require("./services/intentParser");
const {
  catatPengeluaran,
  rekapPengeluaran,
  formatRupiah,
} = require("./services/pengeluaran");
const {
  buatPengingat,
  listPengingatAktif,
  ambilPengingatJatuhTempo,
  tandaiSelesai,
} = require("./services/pengingat");
const { db } = require("./config/firebase");
const { cariBarang, rekapKeuangan, cariTransaksi, ambilInvoice, transaksiByTanggal, riwayatKeuangan, catatKeuangan, formatRupiah: formatRupiahHdb } = require("./services/hdb");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const OWNER_ID = process.env.OWNER_TELEGRAM_ID;

// --- Guard: kalau OWNER_TELEGRAM_ID sudah diisi, bot cuma respon ke kamu ---
bot.use((ctx, next) => {
  const idPengirim = String(ctx.from?.id || "");
  if (OWNER_ID && idPengirim !== String(OWNER_ID)) {
    return; // diemin aja, ga direspon
  }
  return next();
});

// --- Command bantuan buat tau ID Telegram sendiri ---
bot.command("myid", (ctx) => {
  ctx.reply(`ID Telegram kamu: ${ctx.from.id}`);
});

bot.start((ctx) => {
  ctx.reply(
    "Halo! Aku Kronik, asisten pribadi kamu ✨\n\n" +
      "Aku bisa:\n" +
      "- Diajak ngobrol bebas\n" +
      "- Catat pengeluaran (contoh: \"abis jajan 20rb\")\n" +
      "- Bikinin pengingat (contoh: \"ingetin aku bayar kos besok jam 9 pagi\")\n\n" +
      "Command lain: /rekap, /pengingat"
  );
});

// --- Command rekap pengeluaran bulan ini ---
bot.command("rekap", async (ctx) => {
  const { perKategori, total, jumlahTransaksi } = await rekapPengeluaran(
    ctx.from.id
  );

  if (jumlahTransaksi === 0) {
    return ctx.reply("Belum ada catatan pengeluaran bulan ini.");
  }

  let pesan = `📊 Rekap Bulan Ini (${jumlahTransaksi} transaksi)\n\n`;
  for (const [kategori, jumlah] of Object.entries(perKategori)) {
    pesan += `${kategori}: ${formatRupiah(jumlah)}\n`;
  }
  pesan += `\nTotal: ${formatRupiah(total)}`;

  ctx.reply(pesan);
});

bot.command("grafik", async (ctx) => {
  const { perKategori, total, jumlahTransaksi } = await rekapPengeluaran(ctx.from.id);

  if (jumlahTransaksi === 0) {
    return ctx.reply("Belum ada data buat divisualisasiin.");
  }

  const konfigChart = {
    type: "pie",
    data: {
      labels: Object.keys(perKategori),
      datasets: [{ data: Object.values(perKategori) }],
    },
    options: {
      plugins: {
        title: { display: true, text: `Pengeluaran Bulan Ini - Total ${formatRupiah(total)}` },
      },
    },
  };

  const urlChart = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(konfigChart))}`;

  await ctx.replyWithPhoto(urlChart);
});
// --- Command list pengingat aktif ---
bot.command("pengingat", async (ctx) => {
  const daftar = await listPengingatAktif(ctx.from.id);

  if (daftar.length === 0) {
    return ctx.reply("Ga ada pengingat aktif.");
  }

  const pesan = daftar
    .map(
      (item) =>
        `- ${item.isi} (${dayjs(item.waktu).format("DD MMM YYYY, HH:mm")})`
    )
    .join("\n");

  ctx.reply(`⏰ Pengingat aktif:\n\n${pesan}`);
});

bot.command("db", async (ctx) => {
  const snapshot = await db.ref("/").once("value");
  const data = snapshot.val();

  if (!data) {
    return ctx.reply("Database masih kosong.");
  }

  const teks = JSON.stringify(data, null, 2);

  if (teks.length > 3500) {
    await ctx.replyWithDocument({
      source: Buffer.from(teks),
      filename: "database.json",
    });
  } else {
    await ctx.reply(teks);
  }
});
bot.command("cek_barang", async (ctx) => {
  const kataKunci = ctx.message.text.split(" ").slice(1).join(" ");
  if (!kataKunci) return ctx.reply("Ketik: /cek <nama barang>\nContoh: /cek kapasitor 25uf");
bot.help((ctx) => {
  ctx.reply(
    "📋 Daftar perintah:\n\n" +
      "/rekap - Total pengeluaran pribadi bulan ini\n" +
      "/grafik - Chart pengeluaran pribadi\n" +
      "/pengingat - List reminder aktif\n" +
      "/cekbarang <nama> - Cari stok & harga barang HDB\n" +
      "/rekapkeuangan - Rekap keuangan bisnis HDB\n" +
      "/riwayatpemasukan - 10 pemasukan terakhir\n" +
      "/riwayatpengeluaranbisnis - 10 pengeluaran bisnis terakhir\n" +
      "/masuk <jumlah> <ket> - Catat pemasukan baru\n" +
      "/keluarbisnis <jumlah> <ket> - Catat pengeluaran bisnis baru\n" +
      "/grafikbisnis - Chart pemasukan vs pengeluaran\n" +
      "/transaksi <kata kunci> - Cari transaksi HDB\n" +
      "/invoice <nomor nota> - Detail invoice\n" +
      "/tanggal <YYYY-MM-DD> - Transaksi per tanggal\n" +
      "/myid - Cek Telegram ID kamu\n\n" +
      "Atau chat bebas aja buat catat pengeluaran pribadi/reminder/ngobrol."
  );
});
  const hasil = await cariBarang(kataKunci);
  if (hasil.length === 0) return ctx.reply("Barang ga ketemu.");

  const pesan = hasil
    .map((b) => `${b.merek} ${b.model}\nHarga: ${formatRupiahHdb(b.harga)} | Stok: ${b.stok}`)
    .join("\n\n");

  ctx.reply(pesan);
});

bot.command("rekap_keuangan", async (ctx) => {
  const { totalPemasukan, totalPengeluaran, saldoBersih, jumlahTransaksi } = await rekapKeuangan();
  if (jumlahTransaksi === 0) return ctx.reply("Belum ada data keuangan bulan ini.");

  ctx.reply(
    `💰 Rekap Keuangan Bulan Ini\n\n` +
      `Pemasukan: ${formatRupiahHdb(totalPemasukan)}\n` +
      `Pengeluaran: ${formatRupiahHdb(totalPengeluaran)}\n` +
      `Saldo bersih: ${formatRupiahHdb(saldoBersih)}\n\n` +
      `(${jumlahTransaksi} transaksi)`
  );
});

bot.command("riwayat_pemasukan", async (ctx) => {
  const daftar = await riwayatKeuangan("pemasukan");
  if (daftar.length === 0) return ctx.reply("Belum ada data pemasukan.");

  const pesan = daftar
    .map((item) => `${dayjs(item.tanggal).format("DD MMM")} — ${formatRupiahHdb(item.jumlah)} (${item.keterangan || item.kategori})`)
    .join("\n");

  ctx.reply(`💵 10 Pemasukan Terakhir:\n\n${pesan}`);
});

bot.command("riwayat_pengeluaran_bisnis", async (ctx) => {
  const daftar = await riwayatKeuangan("pengeluaran");
  if (daftar.length === 0) return ctx.reply("Belum ada data pengeluaran.");

  const pesan = daftar
    .map((item) => `${dayjs(item.tanggal).format("DD MMM")} — ${formatRupiahHdb(item.jumlah)} (${item.keterangan || item.kategori})`)
    .join("\n");

  ctx.reply(`💸 10 Pengeluaran Bisnis Terakhir:\n\n${pesan}`);
});

bot.command("pemasukan_bisnis", async (ctx) => {
  const teks = ctx.message.text.split(" ").slice(1);
  const jumlah = teks[0];
  const keterangan = teks.slice(1).join(" ");

  if (!jumlah || isNaN(jumlah)) {
    return ctx.reply("Ketik: /masuk <jumlah> <keterangan>\nContoh: /masuk 50000 jual freon R32");
  }

  const hasil = await catatKeuangan("pemasukan", jumlah, "Umum", keterangan);
  ctx.reply(`✅ Pemasukan dicatat: ${formatRupiahHdb(hasil.jumlah)} - ${hasil.keterangan}`);
});

bot.command("pengeluaran_bisnis", async (ctx) => {
  const teks = ctx.message.text.split(" ").slice(1);
  const jumlah = teks[0];
  const keterangan = teks.slice(1).join(" ");

  if (!jumlah || isNaN(jumlah)) {
    return ctx.reply("Ketik: /keluarbisnis <jumlah> <keterangan>\nContoh: /keluarbisnis 30000 bensin toko");
  }

  const hasil = await catatKeuangan("pengeluaran", jumlah, "pengeluaran", keterangan);
  ctx.reply(`✅ Pengeluaran bisnis dicatat: ${formatRupiahHdb(hasil.jumlah)} - ${hasil.keterangan}`);
});

bot.command("grafik_bisnis", async (ctx) => {
  const { totalPemasukan, totalPengeluaran, jumlahTransaksi } = await rekapKeuangan();

  if (jumlahTransaksi === 0) {
    return ctx.reply("Belum ada data keuangan bulan ini.");
  }

  const konfigChart = {
    type: "bar",
    data: {
      labels: ["Pemasukan", "Pengeluaran"],
      datasets: [
        {
          label: "Rupiah",
          data: [totalPemasukan, totalPengeluaran],
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

  const urlChart = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(konfigChart))}`;

  await ctx.replyWithPhoto(urlChart);
});

bot.command("cek_transaksi", async (ctx) => {
  const kataKunci = ctx.message.text.split(" ").slice(1).join(" ");
  if (!kataKunci) return ctx.reply("Ketik: /transaksi <pelanggan/nota/barang>");

  const hasil = await cariTransaksi(kataKunci);
  if (hasil.length === 0) return ctx.reply("Transaksi ga ketemu.");

  const pesan = hasil
    .map(
      (trx) =>
        `${dayjs(trx.tanggal).format("DD MMM YYYY")} - ${trx.nomorNota || "-"}\n` +
        `Pelanggan: ${trx.pelanggan || "-"}\n` +
        `Total: ${formatRupiahHdb(trx.total)}`
    )
    .join("\n\n");

  ctx.reply(pesan);
});

bot.command("invoice", async (ctx) => {
  const nomorNota = ctx.message.text.split(" ").slice(1).join(" ");
  if (!nomorNota) return ctx.reply("Ketik: /invoice <nomor nota>\nContoh: /invoice INV-202605--OSG");

  const trx = await ambilInvoice(nomorNota);
  if (!trx) return ctx.reply("Nota ga ketemu.");

  const daftarItem = (trx.items || [])
    .map((it) => `- ${it.barang?.merek || ""} ${it.barang?.model || ""} x${it.jumlah} @ ${formatRupiahHdb(it.barang?.harga || 0)}`)
    .join("\n");

  ctx.reply(
    `🧾 ${trx.nomorNota}\n` +
      `${dayjs(trx.tanggal).format("DD MMM YYYY, HH:mm")}\n` +
      `Pelanggan: ${trx.pelanggan || "-"}\n\n` +
      `${daftarItem}\n\n` +
      `Total: ${formatRupiahHdb(trx.total)}\n` +
      `Bayar: ${formatRupiahHdb(trx.bayar)}\n` +
      `Kembali: ${formatRupiahHdb(trx.kembali)}`
  );
});

bot.command("transaksi_tanggal", async (ctx) => {
  const tanggalInput = ctx.message.text.split(" ")[1];
  if (!tanggalInput) return ctx.reply("Ketik: /tanggal <YYYY-MM-DD>\nContoh: /tanggal 2026-07-01");

  const daftar = await transaksiByTanggal(tanggalInput);
  if (daftar.length === 0) return ctx.reply(`Ga ada transaksi tanggal ${tanggalInput}.`);

  const totalHari = daftar.reduce((jumlah, trx) => jumlah + trx.total, 0);
  const pesan = daftar
    .map((trx) => `${trx.nomorNota || "-"} — ${formatRupiahHdb(trx.total)} (${trx.pelanggan || "-"})`)
    .join("\n");

  ctx.reply(
    `📅 Transaksi ${tanggalInput} (${daftar.length} nota)\n\n${pesan}\n\nTotal hari ini: ${formatRupiahHdb(totalHari)}`
  );
});

bot.help((ctx) => {
  ctx.reply(
    "📋 Daftar perintah:\n\n" +
      "/rekap - Total pengeluaran bulan ini\n" +
      "/riwayat - 10 transaksi pengeluaran terakhir\n" +
      "/pengingat - List reminder aktif\n" +
      "/grafik - Pie chart pengeluaran\n" +
      "/cek <barang> - Cari stok & harga barang HDB\n" +
      "/keuangan - Rekap keuangan bisnis HDB\n" +
      "/transaksi <kata kunci> - Cari transaksi HDB\n" +
      "/myid - Cek Telegram ID kamu\n\n" +
      "Atau chat bebas aja, nanti otomatis kedeteksi mau catat pengeluaran/reminder/ngobrol biasa."
  );
});
// --- Handler pesan bebas: diklasifikasi dulu niatnya ---
bot.on("text", async (ctx) => {
  const teks = ctx.message.text;
  if (teks.startsWith("/")) return; // command ga dikelola sini

  await ctx.sendChatAction("typing");

  const { intent, data } = await klasifikasiPesan(teks);

  if (intent === "pengeluaran" && data.jumlah) {
    const hasil = await catatPengeluaran(ctx.from.id, data);
    return ctx.reply(
      `✅ Dicatat: ${formatRupiah(hasil.jumlah)} - ${hasil.kategori}\n"${hasil.keterangan}"`
    );
  }

  if (intent === "pengingat" && data.waktu) {
    const hasil = await buatPengingat(ctx.from.id, data);
    return ctx.reply(
      `⏰ Oke, diingetin: "${hasil.isi}" pada ${dayjs(hasil.waktu).format(
        "DD MMM YYYY, HH:mm"
      )}`
    );
  }

  // Default: chat AI biasa
  const hasilChat = await modelUtama.generateContent(teks);
  ctx.reply(hasilChat.response.text());
});

// --- Cron cek pengingat jatuh tempo tiap menit ---
cron.schedule("* * * * *", async () => {
  const jatuhTempo = await ambilPengingatJatuhTempo();
  for (const item of jatuhTempo) {
    await bot.telegram.sendMessage(item.telegramId, `🔔 Pengingat: ${item.isi}`);
    await tandaiSelesai(item.telegramId, item.id);
  }
});
bot.catch((err, ctx) => {
  console.error("Error ga ke-handle:", err.message);
  ctx.reply("Lagi ada gangguan (kemungkinan limit AI harian abis), coba lagi nanti ya 🙏").catch(() => {});
});
bot.launch();
console.log("Kronik bot jalan...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
