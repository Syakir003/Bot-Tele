const { db } = require("../config/firebase");
const dayjs = require("dayjs");

function formatRupiah(angka) {
  return "Rp " + Number(angka).toLocaleString("id-ID");
}

async function cariBarang(kataKunci, batas = 8) {
  const snapshot = await db.ref("barang").once("value");
  const semuaBarang = snapshot.val() || {};
  const kunci = kataKunci.toLowerCase();

  return Object.values(semuaBarang)
    .filter((item) => {
      const teks = `${item.merek || ""} ${item.model || ""} ${item.kategori || ""}`.toLowerCase();
      return teks.includes(kunci);
    })
    .slice(0, batas);
}

async function rekapKeuangan(bulanIni = true) {
  const snapshot = await db.ref("keuangan").once("value");
  const semuaData = snapshot.val() || {};
  const bulanSekarang = dayjs().format("YYYY-MM");

  let totalPemasukan = 0;
  let totalPengeluaran = 0;
  let jumlahTransaksi = 0;

  for (const item of Object.values(semuaData)) {
    if (bulanIni && dayjs(item.tanggal).format("YYYY-MM") !== bulanSekarang) continue;
    jumlahTransaksi++;
    if (item.jenis === "pemasukan") totalPemasukan += item.jumlah;
    else if (item.jenis === "pengeluaran") totalPengeluaran += item.jumlah;
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
  const semuaData = snapshot.val() || {};

  let daftar = Object.values(semuaData);
  if (jenisFilter) {
    daftar = daftar.filter((item) => item.jenis === jenisFilter);
  }

  return daftar
    .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))
    .slice(0, jumlahData);
}

async function catatKeuangan(jenis, jumlah, kategori, keterangan) {
  const ref = db.ref("keuangan").push();
  const data = {
    id: ref.key,
    jenis, // "pemasukan" atau "pengeluaran"
    jumlah: Number(jumlah) || 0,
    kategori: kategori || "Umum",
    keterangan: keterangan || "",
    tanggal: dayjs().format("YYYY-MM-DD"),
  };
  await ref.set(data);
  return data;
}

async function cariTransaksi(kataKunci, batas = 5) {
  const snapshot = await db.ref("transaksi").once("value");
  const semuaTransaksi = snapshot.val() || {};
  const kunci = kataKunci.toLowerCase();

  const hasil = Object.values(semuaTransaksi).filter((trx) => {
    const pelanggan = (trx.pelanggan || "").toLowerCase();
    const nota = (trx.nomorNota || "").toLowerCase();
    const namaBarang = (trx.items || [])
      .map((it) => `${it.barang?.merek || ""} ${it.barang?.model || ""}`)
      .join(" ")
      .toLowerCase();
    return pelanggan.includes(kunci) || nota.includes(kunci) || namaBarang.includes(kunci);
  });

  return hasil.sort((a, b) => b.tanggal - a.tanggal).slice(0, batas);
}

async function transaksiByTanggal(tanggalDicari) {
  const snapshot = await db.ref("transaksi").once("value");
  const semuaTransaksi = snapshot.val() || {};

  return Object.values(semuaTransaksi)
    .filter((trx) => dayjs(trx.tanggal).format("YYYY-MM-DD") === tanggalDicari)
    .sort((a, b) => b.tanggal - a.tanggal);
}

async function ambilInvoice(nomorNota) {
  const snapshot = await db.ref("transaksi").once("value");
  const semuaTransaksi = snapshot.val() || {};

  const hasil = Object.values(semuaTransaksi).find(
    (trx) => (trx.nomorNota || "").toLowerCase() === nomorNota.toLowerCase()
  );

  return hasil || null;
}
module.exports = { cariBarang, rekapKeuangan, cariTransaksi, ambilInvoice, transaksiByTanggal, riwayatKeuangan, catatKeuangan, formatRupiah };
