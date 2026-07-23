const { db } = require("../config/firebase");
const dayjs = require("dayjs");

// --- LIHAT / CARI ---
async function cariBarang(kataKunci, batas = 8) {
  const snapshot = await db.ref("barang").once("value");
  const semua = snapshot.val() || {};
  const kunci = (kataKunci || "").toLowerCase();

  return Object.entries(semua)
    .map(([id, item]) => ({ id, ...item }))
    .filter((item) => {
      const teks = `${item.merek || ""} ${item.model || ""} ${item.kategori || ""} ${item.barcode || ""}`.toLowerCase();
      return teks.includes(kunci);
    })
    .slice(0, batas);
}

async function ambilBarangById(id) {
  const snapshot = await db.ref(`barang/${id}`).once("value");
  const data = snapshot.val();
  return data ? { id, ...data } : null;
}

async function stokRendah(batas = 20) {
  const snapshot = await db.ref("barang").once("value");
  const semua = snapshot.val() || {};

  return Object.entries(semua)
    .map(([id, item]) => ({ id, ...item }))
    .filter((item) => Number(item.stok) <= (Number(item.stokMinimal) || 0))
    .slice(0, batas);
}

// --- BROWSE BERTINGKAT: kategori -> merek -> list barang ---
async function daftarKategori() {
  const snapshot = await db.ref("barang").once("value");
  const semua = snapshot.val() || {};
  const hitung = {};

  for (const item of Object.values(semua)) {
    const k = (item.kategori || "Lainnya").trim();
    hitung[k] = (hitung[k] || 0) + 1;
  }

  return Object.entries(hitung)
    .map(([kategori, jumlah]) => ({ kategori, jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah);
}

async function daftarMerek(kategoriFilter = null) {
  const snapshot = await db.ref("barang").once("value");
  const semua = snapshot.val() || {};
  const hitung = {};

  for (const item of Object.values(semua)) {
    if (kategoriFilter && (item.kategori || "").toLowerCase() !== kategoriFilter.toLowerCase()) continue;
    const m = (item.merek || "Lainnya").trim() || "Lainnya";
    hitung[m] = (hitung[m] || 0) + 1;
  }

  return Object.entries(hitung)
    .map(([merek, jumlah]) => ({ merek, jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah);
}

async function barangByFilter({ kategori = null, merek = null } = {}, batas = 30) {
  const snapshot = await db.ref("barang").once("value");
  const semua = snapshot.val() || {};

  return Object.entries(semua)
    .map(([id, item]) => ({ id, ...item }))
    .filter((item) => {
      const cocokKategori = !kategori || (item.kategori || "").toLowerCase() === kategori.toLowerCase();
      const cocokMerek = !merek || (item.merek || "Lainnya").toLowerCase() === merek.toLowerCase();
      return cocokKategori && cocokMerek;
    })
    .slice(0, batas);
}

// --- TAMBAH ---
async function tambahBarang({ merek, model, kategori, harga, hargaBeli, stok, stokMinimal, satuan, barcode, keterangan }) {
  const ref = db.ref("barang").push();
  const data = {
    merek: merek || "",
    model: model || "",
    kategori: kategori || "",
    harga: Number(harga) || 0,
    hargaBeli: Number(hargaBeli) || 0,
    stok: Number(stok) || 0,
    stokMinimal: Number(stokMinimal) || 0,
    satuan: satuan || "pcs",
    barcode: barcode || "",
    keterangan: keterangan || "",
    dibuatPada: dayjs().format(),
  };
  await ref.set(data);
  return { id: ref.key, ...data };
}

// --- EDIT ---
async function editBarang(id, perubahan) {
  const barang = await ambilBarangById(id);
  if (!barang) return null;

  const fieldDiizinkan = ["merek", "model", "kategori", "harga", "hargaBeli", "stok", "stokMinimal", "satuan", "barcode", "keterangan", "pk"];
  const update = {};
  for (const [key, val] of Object.entries(perubahan)) {
    if (fieldDiizinkan.includes(key)) {
      update[key] = ["harga", "hargaBeli", "stok", "stokMinimal"].includes(key) ? Number(val) : val;
    }
  }

  await db.ref(`barang/${id}`).update(update);
  return await ambilBarangById(id);
}

// --- HAPUS (soft delete) ---
async function hapusBarang(id) {
  const barang = await ambilBarangById(id);
  if (!barang) return null;

  await db.ref(`barang_terhapus/${id}`).set({ ...barang, dihapusPada: dayjs().format() });
  await db.ref(`barang/${id}`).remove();
  return barang;
}

module.exports = {
  cariBarang,
  ambilBarangById,
  stokRendah,
  daftarKategori,
  daftarMerek,
  barangByFilter,
  tambahBarang,
  editBarang,
  hapusBarang,
};
