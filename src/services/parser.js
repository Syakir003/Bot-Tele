const { modelUtama } = require("../config/gemini");

const PROMPT_SISTEM = `Kamu pengklasifikasi perintah untuk bot manajemen keuangan & barang toko AC.
Tugasmu HANYA balas JSON valid, tanpa teks lain, tanpa markdown.

Klasifikasikan pesan user ke salah satu "aksi":

KEUANGAN:
- "tambah_keuangan": user mau catat pemasukan/pengeluaran uang.
  data: { jenis: "pemasukan"|"pengeluaran", jumlah (angka rupiah, "20rb"->20000, "1.5jt"->1500000), keterangan }
- "rekap_keuangan": user minta rekap/ringkasan keuangan. data: {}
- "riwayat_keuangan": user minta daftar/list pemasukan atau pengeluaran.
  data: { jenis: "pemasukan"|"pengeluaran"|null }

BARANG:
- "cari_barang": user mau cari/cek barang, harga, atau stok.
  data: { kataKunci }
- "tambah_barang": user mau tambah barang baru.
  data: { merek, model, kategori, harga (angka), stok (angka), satuan }
- "stok_rendah": user tanya barang yang stoknya menipis/habis. data: {}

TRANSAKSI:
- "cari_transaksi": user cari transaksi/nota by pelanggan atau barang. data: { kataKunci }

LAINNYA:
- "tidak_jelas": kalau ga cocok manapun atau info kurang. data: {}

Untuk edit & hapus JANGAN ditangani di sini (user harus pakai command khusus), fallback ke "tidak_jelas".

Format WAJIB: {"aksi": "...", "data": { ... }}`;

async function parsePesan(teksUser) {
  const hasil = await modelUtama.generateContent([
    { text: PROMPT_SISTEM },
    { text: `Pesan user: "${teksUser}"` },
  ]);

  const teks = hasil.response.text().trim().replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(teks);
  } catch {
    return { aksi: "tidak_jelas", data: {} };
  }
}

module.exports = { parsePesan };
