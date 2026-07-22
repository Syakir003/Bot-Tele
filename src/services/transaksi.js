const { db } = require("../config/firebase");
const dayjs = require("dayjs");

async function cariTransaksi(kataKunci, batas = 5) {
  const snapshot = await db.ref("transaksi").once("value");
  const semua = snapshot.val() || {};
  const kunci = (kataKunci || "").toLowerCase();

  return Object.values(semua)
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

async function ambilInvoice(nomorNota) {
  const snapshot = await db.ref("transaksi").once("value");
  const semua = snapshot.val() || {};
  return (
    Object.values(semua).find(
      (trx) => (trx.nomorNota || "").toLowerCase() === (nomorNota || "").toLowerCase()
    ) || null
  );
}

async function transaksiByTanggal(tanggalDicari) {
  const snapshot = await db.ref("transaksi").once("value");
  const semua = snapshot.val() || {};

  return Object.values(semua)
    .filter((trx) => dayjs(trx.tanggal).format("YYYY-MM-DD") === tanggalDicari)
    .sort((a, b) => b.tanggal - a.tanggal);
}

module.exports = { cariTransaksi, ambilInvoice, transaksiByTanggal };
