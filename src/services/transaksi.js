const { db } = require("../config/firebase");
const dayjs = require("dayjs");

function withId(entries) {
  return entries.map(([id, item]) => ({ id, ...item }));
}

async function cariTransaksi(kataKunci, batas = 8) {
  const snapshot = await db.ref("transaksi").once("value");
  const semua = snapshot.val() || {};
  const kunci = (kataKunci || "").toLowerCase();

  return withId(Object.entries(semua))
    .filter((trx) => {
      const pelanggan = (trx.pelanggan || "").toLowerCase();
      const nota = (trx.nomorNota || "").toLowerCase();
      const namaBarang = (trx.items || [])
        .map((it) => `${it.barang?.merek || ""} ${it.barang?.model || ""}`)
        .join(" ")
        .toLowerCase();
      return pelanggan.includes(kunci) || nota.includes(kunci) || namaBarang.includes(kunci);
    })
    .sort((a, b) => b.tanggal - a.tanggal)
    .slice(0, batas);
}

async function transaksiTerbaru(batas = 10) {
  const snapshot = await db.ref("transaksi").once("value");
  const semua = snapshot.val() || {};
  return withId(Object.entries(semua))
    .sort((a, b) => b.tanggal - a.tanggal)
    .slice(0, batas);
}

async function ambilInvoiceById(id) {
  const snapshot = await db.ref(`transaksi/${id}`).once("value");
  const data = snapshot.val();
  return data ? { id, ...data } : null;
}

async function ambilInvoice(nomorNota) {
  const snapshot = await db.ref("transaksi").once("value");
  const semua = snapshot.val() || {};
  const hasil = withId(Object.entries(semua)).find(
    (trx) => (trx.nomorNota || "").toLowerCase() === (nomorNota || "").toLowerCase()
  );
  return hasil || null;
}

async function transaksiByTanggal(tanggalDicari) {
  const snapshot = await db.ref("transaksi").once("value");
  const semua = snapshot.val() || {};
  return withId(Object.entries(semua))
    .filter((trx) => dayjs(trx.tanggal).format("YYYY-MM-DD") === tanggalDicari)
    .sort((a, b) => b.tanggal - a.tanggal);
}

module.exports = { cariTransaksi, transaksiTerbaru, ambilInvoice, ambilInvoiceById, transaksiByTanggal };
