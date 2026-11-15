// Harness e2e: menjalankan bot ASLI (Telegraf + semua handler) dengan Telegram palsu & Firebase palsu.
// Setiap pesan keluar divalidasi seperti Telegram akan memvalidasinya (HTML, panjang teks, callback_data 64 byte).
const assert = require("node:assert/strict");
const { Telegram } = require("telegraf");
const { buatFakeDb } = require("./fakeDb");
const { mulai } = require("../../src/data/repo");
const { buatBot } = require("../../src/app");
const { buatManajerSesi } = require("../../src/interaksi/sesi");

const senyap = { error() {}, warn() {}, log() {} };

// Telegraf membuat instance Telegram BARU di tiap update, jadi API palsu dipasang di prototype
// dan dipilah per token (satu token = satu harness).
const penangan = new Map();
Telegram.prototype.callApi = async function callApiPalsu(method, payload) {
  const tangani = penangan.get(this.token);
  if (!tangani) throw new Error(`Tidak ada harness untuk token ${this.token} (method ${method})`);
  return tangani(method, payload);
};
let nomorHarness = 0;

// Validasi HTML ala Telegram: hanya <b> <i> <code>, seimbang, '<' '>' '&' lain harus di-escape
function periksaHtml(teks) {
  const sisa = teks.replace(/<\/?(b|i|code)>/g, "");
  assert.ok(!/[<>]/.test(sisa), `HTML tidak ter-escape: ${teks}`);
  assert.ok(!/&(?!(amp|lt|gt|quot);)/.test(sisa), `& tidak ter-escape: ${teks}`);
  const tumpukan = [];
  for (const m of teks.matchAll(/<(\/?)(b|i|code)>/g)) {
    if (m[1]) assert.equal(tumpukan.pop(), m[2], `tag tidak seimbang: ${teks}`);
    else tumpukan.push(m[2]);
  }
  assert.equal(tumpukan.length, 0, `tag tidak ditutup: ${teks}`);
}

function periksaKeluar({ method, payload }) {
  if (method === "sendMessage" || method === "editMessageText") {
    assert.ok(payload.text && payload.text.length > 0, "teks kosong");
    assert.ok(payload.text.length <= 4096, `teks ${payload.text.length} > 4096`);
    if (payload.parse_mode === "HTML") periksaHtml(payload.text);
    const rm = payload.reply_markup;
    if (rm && rm.inline_keyboard) {
      for (const baris of rm.inline_keyboard) {
        assert.ok(baris.length > 0 && baris.length <= 8, "baris tombol tidak valid");
        for (const t of baris) {
          assert.ok(Buffer.byteLength(t.callback_data || "") <= 64, `callback_data > 64 byte: ${t.callback_data}`);
          assert.ok(t.text && t.text.length > 0, "label tombol kosong");
        }
      }
    }
  }
}

async function buatHarness({ data = {}, nlu, ownerId = "42", sesi } = {}) {
  const db = buatFakeDb(data);
  await mulai({ db });
  const token = `123:TEST${++nomorHarness}`;
  const bot = buatBot({
    token,
    ownerId,
    nlu: { parsePesan: nlu || (async () => ({ aksi: "tidak_jelas", data: {} })) },
    sesi: sesi || buatManajerSesi(),
    log: senyap,
  });
  bot.botInfo = { id: 999, is_bot: true, first_name: "HDB", username: "hdb_test_bot" };

  const keluar = [];
  let idPesan = 1000;
  penangan.set(token, async (method, payload) => {
    const rekam = { method, payload };
    periksaKeluar(rekam);
    keluar.push(rekam);
    if (method === "sendMessage") return { message_id: ++idPesan, chat: { id: payload.chat_id }, date: 0, text: payload.text };
    if (method === "editMessageText") return { message_id: payload.message_id, chat: { id: payload.chat_id }, date: 0, text: payload.text };
    return true;
  });

  let idUpdate = 1;
  let idCb = 1;
  const pengguna = (id) => ({ id: Number(id), is_bot: false, first_name: "U" });

  const h = {
    db,
    bot,
    keluar,
    async teks(isi, dari = 42) {
      const perintah = isi.startsWith("/") ? [{ type: "bot_command", offset: 0, length: isi.split(/\s/)[0].length }] : undefined;
      await bot.handleUpdate({
        update_id: idUpdate++,
        message: { message_id: ++idPesan, date: 0, chat: { id: Number(dari), type: "private" }, from: pengguna(dari), text: isi, entities: perintah },
      });
    },
    // tekan tombol milik pesan `pesan` (hasil h.pesanTerakhir()/h.semuaPesan())
    async tekan(callbackData, pesan = null, dari = 42) {
      // tanpa pesan sebelumnya (tes yang langsung mulai dari tombol), pakai pesan sintetis
      const target = pesan || (h.semuaPesan().length ? h.pesanTerakhir() : { payload: { text: "menu", message_id: idPesan } });
      await bot.handleUpdate({
        update_id: idUpdate++,
        callback_query: {
          id: String(idCb++),
          from: pengguna(dari),
          chat_instance: "x",
          data: callbackData,
          message: { message_id: target.messageId || target.payload.message_id || idPesan, date: 0, chat: { id: Number(dari), type: "private" }, text: target.payload.text },
        },
      });
    },
    // pesan teks keluar (sendMessage / editMessageText) saja
    semuaPesan: () => keluar.filter((k) => k.method === "sendMessage" || k.method === "editMessageText"),
    pesanTerakhir() {
      const p = h.semuaPesan();
      assert.ok(p.length > 0, "belum ada pesan keluar");
      return p[p.length - 1];
    },
    teksTerakhir: () => h.pesanTerakhir().payload.text,
    tombolDari(pesan = null) {
      const p = pesan || h.pesanTerakhir();
      const rm = p.payload.reply_markup;
      return rm && rm.inline_keyboard ? rm.inline_keyboard.flat() : [];
    },
    // cari tombol berdasar label (string/regex) di pesan; balikin callback_data
    callback(label, pesan = null) {
      const cocok = h.tombolDari(pesan).find((t) => (label instanceof RegExp ? label.test(t.text) : t.text === label || t.text.includes(label)));
      assert.ok(cocok, `tombol "${label}" tidak ada. Ada: ${h.tombolDari(pesan).map((t) => t.text).join(" | ")}`);
      return cocok.callback_data;
    },
    async tekanLabel(label, pesan = null) {
      const target = pesan || h.pesanTerakhir();
      await h.tekan(h.callback(label, target), target);
    },
    toast: () => keluar.filter((k) => k.method === "answerCallbackQuery" && k.payload.text).map((k) => k.payload.text),
    bersihkanLog: () => keluar.splice(0, keluar.length),
    tulisanDb: () => db._log.tulis.filter((t) => !t.path.endsWith("_terhapus") || true),
  };
  return h;
}

module.exports = { buatHarness, periksaHtml, senyap };
