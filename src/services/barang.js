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
    .filter((item) => {
      const min = Number(item.stokMinimal) || 0;
      return Number(item.stok) <= min;
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

// --- EDIT (partial update) ---
async function editBarang(id, perubahan) {
  const barang = await ambilBarangById(id);
  if (!barang) return null;

  // hanya field yang boleh diubah
  const fieldDiizinkan = ["merek", "model", "kategori", "harga", "hargaBeli", "stok", "stokMinimal", "satuan", "barcode", "keterangan"];
  const update = {};
  for (const [key, val] of Object.entries(perubahan)) {
    if (fieldDiizinkan.includes(key)) {
      update[key] = ["harga", "hargaBeli", "stok", "stokMinimal"].includes(key) ? Number(val) : val;
    }
  }

  await db.ref(`barang/${id}`).update(update);
  return await ambilBarangById(id);
}

// --- HAPUS (soft delete: pindah ke arsip) ---
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
  tambahBarang,
  editBarang,
  hapusBarang,
};
