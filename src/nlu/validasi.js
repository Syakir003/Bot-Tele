// Output parser (dari regex maupun Gemini) TIDAK dipercaya begitu saja. Semua lewat sini:
// aksi harus ada di whitelist, tiap field dicek tipenya, yang tidak valid dibuang (nanti ditanyakan ke user).
const { parseJumlah } = require("../services/util");
const { periodeValid } = require("../waktu");

const JENIS = ["pemasukan", "pengeluaran"];

const AKSI = [
  "tambah_keuangan",
  "rekap_keuangan",
  "riwayat_keuangan",
  "cari_barang",
  "daftar_kategori",
  "daftar_merek",
  "tambah_barang",
  "stok_rendah",
  "cari_transaksi",
  "transaksi_terbaru",
  "transaksi_tanggal",
  "sapa",
  "di_luar_hdb",
  "tidak_jelas",
];

const TIDAK_JELAS = { aksi: "tidak_jelas", data: {} };

function str(nilai, maks = 100) {
  if (typeof nilai !== "string") return "";
  // buang karakter kontrol, rapikan spasi
  return nilai.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maks);
}

// Bilangan bulat >= 0 atau undefined (0 valid, tapi "abc" bukan 0)
function bilanganBulat(nilai) {
  if (typeof nilai === "number") return Number.isInteger(nilai) && nilai >= 0 ? nilai : undefined;
  if (typeof nilai === "string" && /^\d{1,9}$/.test(nilai.trim())) return Number(nilai.trim());
  return undefined;
}

function nominal(nilai) {
  const n = parseJumlah(nilai);
  return n > 0 ? n : undefined;
}

function periode(nilai) {
  return typeof nilai === "string" && periodeValid(nilai) ? nilai : undefined;
}

function bersihkan(objek) {
  const hasil = {};
  for (const [k, v] of Object.entries(objek)) if (v !== undefined && v !== "") hasil[k] = v;
  return hasil;
}

function validasi(mentah) {
  if (!mentah || typeof mentah !== "object" || Array.isArray(mentah)) return TIDAK_JELAS;

  const aksi = typeof mentah.aksi === "string" ? mentah.aksi : "";
  if (!AKSI.includes(aksi)) return TIDAK_JELAS;

  const d = mentah.data && typeof mentah.data === "object" && !Array.isArray(mentah.data) ? mentah.data : {};

  switch (aksi) {
    case "tambah_keuangan":
      return {
        aksi,
        data: bersihkan({
          jenis: JENIS.includes(d.jenis) ? d.jenis : undefined,
          jumlah: nominal(d.jumlah),
          keterangan: str(d.keterangan, 200),
          kategori: str(d.kategori, 40),
        }),
      };
    case "rekap_keuangan":
      return { aksi, data: bersihkan({ periode: periode(d.periode) }) };
    case "riwayat_keuangan":
      return {
        aksi,
        data: bersihkan({ jenis: JENIS.includes(d.jenis) ? d.jenis : undefined, periode: periode(d.periode) }),
      };
    case "cari_barang":
    case "cari_transaksi":
      return { aksi, data: bersihkan({ kataKunci: str(d.kataKunci, 80) }) };
    case "daftar_merek":
      return { aksi, data: bersihkan({ kategori: str(d.kategori, 60) }) };
    case "tambah_barang":
      return {
        aksi,
        data: bersihkan({
          merek: str(d.merek, 60),
          model: str(d.model, 80),
          kategori: str(d.kategori, 60),
          harga: nominal(d.harga),
          stok: bilanganBulat(d.stok),
          satuan: str(d.satuan, 20),
        }),
      };
    case "transaksi_tanggal":
      return { aksi, data: bersihkan({ tanggal: str(d.tanggal, 30) }) };
    default:
      // daftar_kategori, stok_rendah, transaksi_terbaru, sapa, di_luar_hdb, tidak_jelas: tanpa data
      return { aksi, data: {} };
  }
}

module.exports = { validasi, AKSI, JENIS, TIDAK_JELAS };
