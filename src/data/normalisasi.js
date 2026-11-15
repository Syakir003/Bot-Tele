const dayjs = require("dayjs");
const { setTersembunyi } = require("./cache");
const { FORMAT_TANGGAL } = require("../waktu");

function teks(nilai) {
  return nilai === undefined || nilai === null ? "" : String(nilai).trim();
}

// Angka valid atau null (null = tidak diketahui; beda dari 0)
function angka(nilai) {
  if (nilai === undefined || nilai === null || nilai === "") return null;
  const n = Number(nilai);
  return Number.isFinite(n) ? n : null;
}

function normalisasiBarang(item) {
  const hasil = {
    ...item,
    merek: teks(item.merek),
    model: teks(item.model),
    kategori: teks(item.kategori),
    satuan: teks(item.satuan),
    barcode: teks(item.barcode),
    keterangan: teks(item.keterangan),
    harga: angka(item.harga) ?? 0,
    hargaBeli: angka(item.hargaBeli) ?? 0,
    stok: angka(item.stok),
    stokMinimal: angka(item.stokMinimal) ?? 0,
  };
  const gabung = `${hasil.merek} ${hasil.model} ${hasil.kategori} ${hasil.barcode}`.toLowerCase();
  return setTersembunyi(hasil, "_teks", gabung);
}

// tanggal keuangan: string "YYYY-MM-DD". Format lain (ISO, ms) dirapikan; yang tidak terbaca jadi "".
function tanggalKeuangan(nilai) {
  if (typeof nilai === "string" && /^\d{4}-\d{2}-\d{2}$/.test(nilai)) return nilai;
  if (nilai === undefined || nilai === null || nilai === "") return "";
  const d = dayjs(typeof nilai === "string" && /^\d+$/.test(nilai) ? Number(nilai) : nilai);
  return d.isValid() ? d.format(FORMAT_TANGGAL) : "";
}

function normalisasiKeuangan(item) {
  const hasil = {
    ...item,
    jenis: teks(item.jenis),
    jumlah: angka(item.jumlah) ?? 0,
    kategori: teks(item.kategori),
    keterangan: teks(item.keterangan),
    tanggal: tanggalKeuangan(item.tanggal),
  };
  return hasil;
}

// tanggal transaksi: ms epoch (angka). String ISO/ms dirapikan; tidak terbaca -> 0
function tanggalTransaksi(nilai) {
  const n = angka(nilai);
  if (n !== null) return n;
  const d = dayjs(nilai);
  return d.isValid() ? d.valueOf() : 0;
}

function normalisasiTransaksi(item) {
  let items = item.items;
  if (items && !Array.isArray(items) && typeof items === "object") items = Object.values(items);
  if (!Array.isArray(items)) items = [];

  const hasil = {
    ...item,
    nomorNota: teks(item.nomorNota),
    pelanggan: teks(item.pelanggan),
    items,
    total: angka(item.total) ?? 0,
    bayar: angka(item.bayar) ?? 0,
    kembali: angka(item.kembali) ?? 0,
    tanggal: tanggalTransaksi(item.tanggal),
  };
  const namaBarang = items.map((it) => `${it?.barang?.merek || ""} ${it?.barang?.model || ""}`).join(" ");
  return setTersembunyi(hasil, "_teks", `${hasil.pelanggan} ${hasil.nomorNota} ${namaBarang}`.toLowerCase());
}

module.exports = { normalisasiBarang, normalisasiKeuangan, normalisasiTransaksi };
