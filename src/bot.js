require("dotenv").config();
require("./waktu"); // paksa timezone WIB sebelum modul lain memakai tanggal

const { mulai: mulaiData } = require("./data/repo");
const { buatBot } = require("./app");
const nlu = require("./nlu");

const OWNER_ID = process.env.OWNER_TELEGRAM_ID;

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN belum diisi di .env");

  if (!OWNER_ID) {
    console.warn(
      "⚠️  OWNER_TELEGRAM_ID kosong: bot TERKUNCI. Hanya /myid yang dijawab. " +
        "Kirim /myid ke bot, isi OWNER_TELEGRAM_ID di .env, lalu restart."
    );
  }

  console.log("Memuat data HDB dari Firebase (sekali, setelah itu realtime)...");
  const jumlah = await mulaiData();
  console.log(`Data siap: ${jumlah.barang} barang, ${jumlah.keuangan} keuangan, ${jumlah.transaksi} transaksi.`);

  const bot = buatBot({ token: process.env.TELEGRAM_BOT_TOKEN, ownerId: OWNER_ID, nlu });

  const me = await bot.telegram.getMe();
  await bot.telegram
    .setMyCommands([
      { command: "menu", description: "Menu utama" },
      { command: "transaksi", description: "Cari transaksi" },
      { command: "invoice", description: "Lihat nota" },
      { command: "tanggal", description: "Transaksi per tanggal" },
      { command: "batal", description: "Batalkan proses" },
    ])
    .catch((err) => console.warn("setMyCommands gagal:", err.message));

  bot.launch().catch((err) => {
    console.error("Bot berhenti karena error:", err);
    process.exit(1);
  });
  console.log(`Bot HDB jalan sebagai @${me.username}`);

  const berhenti = (sinyal) => () => {
    bot.stop(sinyal);
    process.exit(0);
  };
  process.once("SIGINT", berhenti("SIGINT"));
  process.once("SIGTERM", berhenti("SIGTERM"));
}

// Error async yang lolos jangan menjatuhkan bot (PM2 restart = download ulang cache); cukup dicatat
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

main().catch((err) => {
  console.error("Gagal start:", err.message);
  process.exit(1);
});
