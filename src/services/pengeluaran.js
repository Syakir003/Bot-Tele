const { db } = require("../config/firebase");
const dayjs = require("dayjs");

async function catatPengeluaran(telegramId, { jumlah, kategori, keterangan }) {
  const ref = db.ref(`pengeluaran/${telegramId}`).push();
  const data = {
    jumlah: Number(jumlah) || 0,
    kategori: kategori || "lainnya",
    keterangan: keterangan || "",
    tanggal: dayjs().format(),
  };
  await ref.set(data);
  return data;
}

async function rekapPengeluaran(telegramId, { bulanIni = true } = {}) {
  const snapshot = await db.ref(`pengeluaran/${telegramId}`).once("value");
  const semuaData = snapshot.val() || {};

  const bulanSekarang = dayjs().format("YYYY-MM");
  const daftar = Object.values(semuaData).filter((item) => {
    if (!bulanIni) return true;
    return dayjs(item.tanggal).format("YYYY-MM") === bulanSekarang;
  });

  const perKategori = {};
  let total = 0;

  for (const item of daftar) {
    perKategori[item.kategori] = (perKategori[item.kategori] || 0) + item.jumlah;
    total += item.jumlah;
  }

  return { perKategori, total, jumlahTransaksi: daftar.length };
}

function formatRupiah(angka) {
  return "Rp " + Number(angka).toLocaleString("id-ID");
}

module.exports = { catatPengeluaran, rekapPengeluaran, formatRupiah };
