const { db } = require("../config/firebase");
const dayjs = require("dayjs");

// --- LIHAT / REKAP ---
async function rekapKeuangan({ bulanIni = true } = {}) {
  const snapshot = await db.ref("keuangan").once("value");
  const semua = snapshot.val() || {};
  const bulanSekarang = dayjs().format("YYYY-MM");

  let totalPemasukan = 0;
  let totalPengeluaran = 0;
  let jumlahTransaksi = 0;

  for (const item of Object.values(semua)) {
    if (bulanIni && dayjs(item.tanggal).format("YYYY-MM") !== bulanSekarang)
      continue;
    jumlahTransaksi++;
    if (item.jenis === "pemasukan") totalPemasukan += Number(item.jumlah) || 0;
    else if (item.jenis === "pengeluaran")
      totalPengeluaran += Number(item.jumlah) || 0;
  }

  return {
    totalPemasukan,
    totalPengeluaran,
    saldoBersih: totalPemasukan - totalPengeluaran,
    jumlahTransaksi,
  };
}

async function riwayatKeuangan(jenisFilter = null, jumlahData = 10) {
  const snapshot = await db.ref("keuangan").once("value");
  const semua = snapshot.val() || {};

  let daftar = Object.entries(semua).map(([id, item]) => ({ id, ...item }));
  if (jenisFilter) daftar = daftar.filter((item) => item.jenis === jenisFilter);

  return daftar
    .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))
    .slice(0, jumlahData);
}

async function ambilKeuanganById(id) {
  const snapshot = await db.ref(`keuangan/${id}`).once("value");
  const data = snapshot.val();
  return data ? { id, ...data } : null;
}

// --- TAMBAH ---
async function catatKeuangan({ jenis, jumlah, kategori, keterangan }) {
  const ref = db.ref("keuangan").push();
  const data = {
    jenis, // "pemasukan" | "pengeluaran"
    jumlah: Number(jumlah) || 0,
    kategori: kategori || "Umum",
    keterangan: keterangan || "",
    tanggal: dayjs().format("YYYY-MM-DD"),
    dibuatPada: dayjs().format(),
  };
  await ref.set(data);
  return { id: ref.key, ...data };
}

// --- EDIT ---
async function editKeuangan(id, perubahan) {
  const data = await ambilKeuanganById(id);
  if (!data) return null;

  const fieldDiizinkan = [
    "jenis",
    "jumlah",
    "kategori",
    "keterangan",
    "tanggal",
  ];
  const update = {};
  for (const [key, val] of Object.entries(perubahan)) {
    if (fieldDiizinkan.includes(key)) {
      update[key] = key === "jumlah" ? Number(val) : val;
    }
  }

  await db.ref(`keuangan/${id}`).update(update);
  return await ambilKeuanganById(id);
}

// --- HAPUS (soft delete) ---
async function hapusKeuangan(id) {
  const data = await ambilKeuanganById(id);
  if (!data) return null;

  await db
    .ref(`keuangan_terhapus/${id}`)
    .set({ ...data, dihapusPada: dayjs().format() });
  await db.ref(`keuangan/${id}`).remove();
  return data;
}

async function ambilArsipKeuangan(jumlahData = 10) {
  const snapshot = await db.ref("keuangan_terhapus").once("value");
  const semua = snapshot.val() || {};
  return Object.entries(semua)
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => new Date(b.dihapusPada) - new Date(a.dihapusPada))
    .slice(0, jumlahData);
}

async function restoreKeuangan(id) {
  const snapshot = await db.ref(`keuangan_terhapus/${id}`).once("value");
  const data = snapshot.val();
  if (!data) return null;

  delete data.dihapusPada;
  await db.ref(`keuangan/${id}`).set(data);
  await db.ref(`keuangan_terhapus/${id}`).remove();
  return { id, ...data };
}

module.exports = {
  rekapKeuangan,
  riwayatKeuangan,
  ambilKeuanganById,
  catatKeuangan,
  editKeuangan,
  hapusKeuangan,
  ambilArsipKeuangan,
  restoreKeuangan,
};
