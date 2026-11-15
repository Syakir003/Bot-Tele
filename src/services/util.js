function formatRupiah(angka) {
  return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

// Ubah teks nominal ("20rb", "1.5jt", "2,5jt", "1.500.000", "Rp 350.000", "50k") jadi angka rupiah.
// Balikin 0 kalau tidak bisa dibaca dengan pasti (lebih baik nanya ulang daripada nebak).
function parseJumlah(teks) {
  if (typeof teks === "number") return Number.isFinite(teks) ? Math.round(teks) : 0;
  if (teks === null || teks === undefined) return 0;

  let s = String(teks).toLowerCase().replace(/\s/g, "").replace(/rp\.?/g, "");
  if (!s) return 0;

  let pengali = 1;
  const m = s.match(/^(.*?)(jt|juta|rb|ribu|k)$/);
  if (m) {
    pengali = m[2] === "jt" || m[2] === "juta" ? 1000000 : 1000;
    s = m[1].replace(",", "."); // dengan suffix, koma/titik = desimal ("1,5jt" / "1.5jt")
  } else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", "."); // 1.500.000 = pemisah ribuan
  } else if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    s = s.replace(/,/g, ""); // 1,500,000
  } else {
    s = s.replace(",", ".");
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return 0;
  return Math.round(parseFloat(s) * pengali);
}

// Escape teks dinamis (merek, keterangan, nama pelanggan, dst) buat parse_mode HTML Telegram
function esc(teks) {
  return String(teks ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = { formatRupiah, parseJumlah, esc };
