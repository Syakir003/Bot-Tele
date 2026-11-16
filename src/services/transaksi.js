const { repo } = require("../data/repo");
const { tanggalDariMs } = require("../waktu");

function kataKunci(teks) {
  return String(teks || "").toLowerCase().split(/\s+/).filter(Boolean);
}

const terbaruDulu = (a, b) => b.tanggal - a.tanggal || b.id.localeCompare(a.id);

function semuaTerurut() {
  return [...repo.transaksi.semua()].sort(terbaruDulu);
}

// Semua kata kunci harus ada di pelanggan / nomor nota / nama barang (urutan bebas)
function cariTransaksi(teks, batas = 200) {
  const kunci = kataKunci(teks);
  return semuaTerurut()
    .filter((t) => kunci.every((k) => t._teks.includes(k)))
    .slice(0, batas);
}

function transaksiTerbaru(batas = 15) {
  return semuaTerurut().slice(0, batas);
}

function ambilInvoiceById(id) {
  return repo.transaksi.ambil(id);
}

function ambilInvoice(nomorNota) {
  const nota = String(nomorNota || "").trim().toLowerCase();
  if (!nota) return null;
  return repo.transaksi.semua().find((t) => t.nomorNota.toLowerCase() === nota) || null;
}

// tanggalDicari: "YYYY-MM-DD" (WIB)
function transaksiByTanggal(tanggalDicari) {
  return semuaTerurut().filter((t) => t.tanggal && tanggalDariMs(t.tanggal) === tanggalDicari);
}

module.exports = { cariTransaksi, transaksiTerbaru, ambilInvoice, ambilInvoiceById, transaksiByTanggal };
