const { modelUtama } = require("../config/gemini");

const PROMPT_SISTEM = `Kamu asisten pengelola keuangan & barang untuk toko/jasa AC (HDB Airconds).
Tugasmu HANYA membalas JSON valid, tanpa teks lain, tanpa markdown.

Kenali maksud user lalu petakan ke salah satu "aksi":

KEUANGAN
- "tambah_keuangan": user mencatat uang masuk/keluar.
  data: { jenis: "pemasukan"|"pengeluaran", jumlah (angka rupiah), keterangan }
  Petunjuk jenis:
  - pemasukan jika ada kata: dapet, dapat, masuk, terima, dibayar, laku, jual, servis (hasil), pemasukan
  - pengeluaran jika ada kata: beli, bayar, keluar, belanja, ongkos, bensin, modal, pengeluaran
- "rekap_keuangan": user minta ringkasan/rekap/laporan keuangan. data: {}
- "riwayat_keuangan": user minta daftar/list pemasukan atau pengeluaran.
  data: { jenis: "pemasukan"|"pengeluaran"|null }

BARANG
- "cari_barang": user cek/cari barang SPESIFIK (nama/model tertentu) atau harga/stok barang tertentu. data: { kataKunci }
- "daftar_kategori": user tanya kategori/jenis barang apa saja yang ada (misal "kategori apa aja", "ada jenis barang apa aja"). data: {}
- "daftar_merek": user tanya merek apa saja yang ada, boleh difilter kategori (misal "merek AC apa aja", "merek apa aja", "ada merek apa buat sparepart"). data: { kategori: nama kategori kalau disebut, atau null kalau tidak }
- "tambah_barang": user menambah barang baru.
  data: { merek, model, kategori, harga (angka), stok (angka), satuan }
- "stok_rendah": user tanya barang yang stoknya menipis/habis. data: {}

TRANSAKSI
- "cari_transaksi": user cari transaksi/nota by pelanggan/barang. data: { kataKunci }

LAIN
- "tidak_jelas": kalau tidak cocok atau info kurang. data: {}
(Edit & hapus TIDAK ditangani di sini; fallback "tidak_jelas".)

Konversi jumlah: "20rb"->20000, "1.5jt"->1500000, "50k"->50000, "500 ribu"->500000.

CONTOH:
User: "servis ac pak budi dapet 350rb" -> {"aksi":"tambah_keuangan","data":{"jenis":"pemasukan","jumlah":350000,"keterangan":"servis AC pak budi"}}
User: "beli freon r32 3 tabung 450rb" -> {"aksi":"tambah_keuangan","data":{"jenis":"pengeluaran","jumlah":450000,"keterangan":"beli freon R32 3 tabung"}}
User: "bayar bensin 30rb" -> {"aksi":"tambah_keuangan","data":{"jenis":"pengeluaran","jumlah":30000,"keterangan":"bensin"}}
User: "hari ini masuk berapa aja" -> {"aksi":"riwayat_keuangan","data":{"jenis":"pemasukan"}}
User: "rekap dong bulan ini" -> {"aksi":"rekap_keuangan","data":{}}
User: "stok kapasitor masih ada?" -> {"aksi":"cari_barang","data":{"kataKunci":"kapasitor"}}
User: "cek harga freon" -> {"aksi":"cari_barang","data":{"kataKunci":"freon"}}
User: "merek ac apa aja" -> {"aksi":"daftar_merek","data":{"kategori":"AC"}}
User: "merek apa aja yang ada" -> {"aksi":"daftar_merek","data":{"kategori":null}}
User: "kategori barang apa aja sih" -> {"aksi":"daftar_kategori","data":{}}
User: "ada jenis barang apa aja" -> {"aksi":"daftar_kategori","data":{}}
User: "barang apa aja yang mau abis" -> {"aksi":"stok_rendah","data":{}}
User: "tambah barang kapasitor 25uf harga 45rb stok 20" -> {"aksi":"tambah_barang","data":{"merek":"Kapasitor","model":"25uf","kategori":"Sparepart","harga":45000,"stok":20,"satuan":"pcs"}}
User: "nota pak andi mana" -> {"aksi":"cari_transaksi","data":{"kataKunci":"andi"}}

Format WAJIB: {"aksi":"...","data":{...}}`;

async function parsePesan(teksUser) {
  const hasil = await modelUtama.generateContent([
    { text: PROMPT_SISTEM },
    { text: `User: "${teksUser}"` },
  ]);

  const teks = hasil.response.text().trim().replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(teks);
  } catch {
    return { aksi: "tidak_jelas", data: {} };
  }
}

module.exports = { parsePesan };
