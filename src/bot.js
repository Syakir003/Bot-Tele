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

bot.launch();
console.log("Kronik bot jalan...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
