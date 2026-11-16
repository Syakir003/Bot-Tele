// Semua teks ke user memakai parse_mode HTML; setiap teks dinamis (merek, keterangan, pelanggan, ...) wajib lewat esc().
const dayjs = require("dayjs");
require("dayjs/locale/id");
const { esc, formatRupiah } = require("../services/util");
const { labelPeriode } = require("../waktu");

dayjs.locale("id");

const rp = (n) => esc(formatRupiah(n));

function tandaJenis(jenis) {
  return jenis === "pemasukan" ? "🟢" : "🔴";
}

// Potong teks panjang (sebelum di-escape) supaya satu baris list tidak melebar
function pendek(teks, maks = 60) {
  const t = String(teks ?? "");
  return t.length > maks ? t.slice(0, maks - 1) + "…" : t;
}

function namaBarang(b) {
  return [b.merek, b.model].filter(Boolean).join(" ") || "(tanpa nama)";
}

function tanggalPendek(tgl) {
  if (!tgl) return "-";
  const d = dayjs(tgl);
  return d.isValid() ? d.format("DD MMM") : "-";
}

function stokTeks(b) {
  return b.stok === null || b.stok === undefined ? "-" : `${b.stok}`;
}

function barangRendah(b) {
  return b.stok !== null && b.stok !== undefined && b.stok <= (b.stokMinimal || 0);
}

// ---- format singkat (baris di list bernomor) ----
function ringkasBarang(b, nomor) {
  return `${nomor}. <b>${esc(pendek(namaBarang(b)))}</b> — ${rp(b.harga)} (stok ${esc(stokTeks(b))})${barangRendah(b) ? " ⚠️" : ""}`;
}

function ringkasKeuangan(k, nomor) {
  return `${nomor}. ${tandaJenis(k.jenis)} ${rp(k.jumlah)} — ${esc(pendek(k.keterangan || k.kategori || "-"))} (${tanggalPendek(k.tanggal)})`;
}

function ringkasTransaksi(t, nomor) {
  return `${nomor}. 🧾 ${esc(pendek(t.nomorNota || "-", 30))} — ${rp(t.total)} (${esc(pendek(t.pelanggan || "-", 30))})`;
}

// ---- format lengkap (satu item) ----
function barisBarang(b) {
  return `📦 <b>${esc(namaBarang(b))}</b>\nHarga: ${rp(b.harga)}  •  Stok: ${esc(stokTeks(b))} ${esc(b.satuan || "")}`;
}

function detailBarang(b) {
  return (
    `📦 <b>${esc(namaBarang(b))}</b>${barangRendah(b) ? "  ⚠️ stok menipis" : ""}\n\n` +
    `Kategori: ${esc(b.kategori || "-")}\n` +
    (b.pk ? `PK: ${esc(b.pk)}\n` : "") +
    `Harga jual: ${rp(b.harga)}\n` +
    `Harga beli: ${rp(b.hargaBeli)}\n` +
    `Stok: ${esc(stokTeks(b))} ${esc(b.satuan || "")} (minimal: ${esc(b.stokMinimal || 0)})` +
    (b.barcode ? `\nBarcode: ${esc(b.barcode)}` : "") +
    (b.keterangan ? `\nKeterangan: ${esc(b.keterangan)}` : "")
  );
}

function barisKeuangan(k) {
  return `${tandaJenis(k.jenis)} ${tanggalPendek(k.tanggal)} — <b>${rp(k.jumlah)}</b>\n${esc(k.keterangan || k.kategori || "-")}`;
}

function teksInvoice(t) {
  const items = (t.items || [])
    .map((it) => {
      const nama = [it?.barang?.merek, it?.barang?.model].filter(Boolean).join(" ") || "(barang)";
      return `• ${esc(nama)} x${esc(it?.jumlah ?? 1)} @ ${rp(it?.barang?.harga || 0)}`;
    })
    .join("\n");
  const waktu = t.tanggal ? dayjs(t.tanggal).format("DD MMM YYYY, HH:mm") : "-";
  return (
    `🧾 <b>${esc(t.nomorNota || "-")}</b>\n${esc(waktu)}\nPelanggan: ${esc(t.pelanggan || "-")}\n\n` +
    `${items || "(tidak ada item tercatat)"}\n\nTotal: <b>${rp(t.total)}</b>\nBayar: ${rp(t.bayar)}\nKembali: ${rp(t.kembali)}`
  );
}

// ---- rekap keuangan + grafik batang teks (tanpa kirim data ke layanan luar) ----
function batang(nilai, maks, lebar = 12) {
  if (!maks || nilai <= 0) return "▏";
  return "█".repeat(Math.max(1, Math.round((nilai / maks) * lebar)));
}

function teksRekap(r) {
  const maks = Math.max(r.totalPemasukan, r.totalPengeluaran);
  return (
    `💰 <b>Rekap — ${esc(labelPeriode(r.periode))}</b>\n\n` +
    `🟢 ${batang(r.totalPemasukan, maks)}\n    ${rp(r.totalPemasukan)}\n` +
    `🔴 ${batang(r.totalPengeluaran, maks)}\n    ${rp(r.totalPengeluaran)}\n\n` +
    `Saldo bersih: <b>${rp(r.saldoBersih)}</b>\n<i>${r.jumlahTransaksi} catatan</i>`
  );
}

module.exports = {
  pendek,
  tandaJenis,
  namaBarang,
  ringkasBarang,
  ringkasKeuangan,
  ringkasTransaksi,
  barisBarang,
  detailBarang,
  barisKeuangan,
  teksInvoice,
  teksRekap,
  batang,
};
