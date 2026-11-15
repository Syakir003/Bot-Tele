// Fast-path: pola yang jelas diproses tanpa Gemini (lebih cepat, hemat kuota, dan tidak bisa di-inject).
// Prinsip: kalau ragu sedikit pun, return null supaya diserahkan ke Gemini.
const { parseJumlah } = require("../services/util");

const KATA_TANYA = /^(berapa|apa|apakah|siapa|kapan|kenapa|mengapa|gimana|bagaimana|mana|dimana|di mana|bisa|boleh)\b/;

const SAPA = /^(halo|hai|hi|hello|hallo|test|tes|p|assalamu'?alaikum|assalamualaikum|selamat (pagi|siang|sore|malam)|makasih|terima ?kasih|thanks?|ok|oke|sip|siap)[\s!.,]*$/;

const REKAP = /^(?:tolong\s+)?(?:rekap|laporan)(?:\s+keuangan)?(?:\s+(hari ini|minggu ini|bulan ini|bulan lalu))?(?:\s+(?:dong|donk|ya|yah|dulu))?[\s!.]*$/;

const STOK_RENDAH = /^(?:cek\s+)?(?:stok|barang)\s+(?:yang\s+)?(?:menipis|rendah|tipis|habis|abis)[\s!.]*$/;

// nominal: angka (boleh titik/koma) + suffix opsional, bukan bagian kata ("r32", "25uf" ditolak)
const NOMINAL = /(?<![\p{L}\d.,])(?:rp\.?\s*)?\d[\d.,]*\s*(?:jt|juta|rb|ribu|k)?(?![\p{L}\d])/giu;

const ADA_NOMINAL = new RegExp(NOMINAL.source, "iu"); // versi non-global buat .test() (tanpa lastIndex)

const CUE_MASUK = /\b(dapet|dapat|diterima|terima|pemasukan|(?:uang|duit)\s+masuk)\b/;
const CUE_KELUAR = /\b(bensin|ongkos|belanja|modal|pengeluaran|(?:uang|duit)\s+keluar)\b/;

const CARI = /^(?:cek\s+)?(stok|harga|cari)\s+([\p{L}\d][\p{L}\d\s\-/.]{0,40})$/u;
const BUKAN_CARI_BARANG = /\b(menipis|rendah|tipis|habis|abis|nota|invoice|transaksi|merek|kategori|keuangan|rekap|laporan|pemasukan|pengeluaran|apa|aja|saja|semua|berapa|barang)\b/;

function cobaCatat(teks) {
  if (/\?$/.test(teks) || KATA_TANYA.test(teks)) return null;

  const cocok = [...teks.matchAll(NOMINAL)];
  if (cocok.length !== 1) return null; // 0 atau >1 angka: ambigu, serahkan ke Gemini

  const mentah = cocok[0][0].trim().replace(/[.,]+$/, "");
  const jumlah = parseJumlah(mentah);
  const adaSuffix = /(jt|juta|rb|ribu|k)$/i.test(mentah);
  if (!jumlah || (!adaSuffix && jumlah < 1000)) return null;

  const masuk = CUE_MASUK.test(teks);
  const keluar = CUE_KELUAR.test(teks);
  if (masuk === keluar) return null; // tidak ada petunjuk jenis, atau saling bentrok

  const keterangan = teks.replace(cocok[0][0], " ").replace(/\s+/g, " ").trim();
  return {
    aksi: "tambah_keuangan",
    data: { jenis: masuk ? "pemasukan" : "pengeluaran", jumlah, keterangan },
  };
}

function cobaCepat(teksAsli) {
  const teks = String(teksAsli || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!teks || teks.length > 200) return null;

  if (SAPA.test(teks)) return { aksi: "sapa", data: {} };

  let m = teks.match(REKAP);
  if (m) return { aksi: "rekap_keuangan", data: m[1] ? { periode: m[1].replace(" ", "_") } : {} };

  if (STOK_RENDAH.test(teks)) return { aksi: "stok_rendah", data: {} };

  const catat = cobaCatat(teks);
  if (catat) return catat;

  m = teks.match(CARI);
  if (m && !KATA_TANYA.test(m[2]) && !BUKAN_CARI_BARANG.test(m[2]) && !ADA_NOMINAL.test(m[2]) && m[2].trim().split(" ").length <= 4) {
    return { aksi: "cari_barang", data: { kataKunci: m[2].trim() } };
  }

  return null;
}

module.exports = { cobaCepat };
