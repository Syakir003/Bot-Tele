function formatRupiah(angka) {
  return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

// Ubah teks jumlah kasar ("20rb", "1.5jt", "50000") jadi angka
function parseJumlah(teks) {
  if (typeof teks === "number") return teks;
  if (!teks) return 0;

  let bersih = String(teks).toLowerCase().replace(/\s/g, "").replace(/rp/g, "");

  let pengali = 1;
  if (bersih.includes("jt") || bersih.includes("juta")) {
    pengali = 1000000;
    bersih = bersih.replace(/jt|juta/g, "");
  } else if (bersih.includes("rb") || bersih.includes("ribu") || bersih.endsWith("k")) {
    pengali = 1000;
    bersih = bersih.replace(/rb|ribu|k/g, "");
  }

  bersih = bersih.replace(/[^0-9.,]/g, "").replace(",", ".");
  const angka = parseFloat(bersih) || 0;
  return Math.round(angka * pengali);
}

module.exports = { formatRupiah, parseJumlah };
