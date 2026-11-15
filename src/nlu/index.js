const { cobaCepat } = require("./cepat");
const { tanyaGemini } = require("./gemini");
const { validasi, TIDAK_JELAS } = require("./validasi");

// Percobaan membajak/mengubah aturan bot: ditolak langsung, tanpa menyentuh Gemini
const COBA_BAJAK = /(abaikan|lupakan|ignore|disregard|forget)\s+(semua\s+|all\s+)?(the\s+|previous\s+|prior\s+|instruksi|aturan|instructions|rules)|system\s*prompt|prompt\s*sistem|jailbreak|developer mode/i;

const MAKS_PANJANG = 500;

// Balikan: { aksi, data } dengan aksi dari whitelist (lihat validasi.js), atau { aksi: "layanan_terbatas" }
// bila Gemini tidak tersedia dan fast-path tidak mengenali pesannya.
function buatParser({ tanya = tanyaGemini, log = console } = {}) {
  return async function parsePesan(teksAsli) {
    const teks = String(teksAsli || "").trim().slice(0, MAKS_PANJANG);
    if (!teks) return TIDAK_JELAS;

    if (COBA_BAJAK.test(teks)) return { aksi: "di_luar_hdb", data: {} };

    const cepat = cobaCepat(teks);
    if (cepat) return validasi(cepat);

    try {
      const mentah = await tanya(teks);
      return validasi(mentah);
    } catch (err) {
      log.error("[nlu] Gemini gagal:", err && err.message);
      return { aksi: "layanan_terbatas", data: {} };
    }
  };
}

module.exports = { buatParser, parsePesan: buatParser() };
