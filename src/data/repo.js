// Titik tunggal akses data. Service membaca `repo.barang` dst; mulai() menyambungkan ke Firebase asli,
// pasang() dipakai test buat nyuntik cache/db palsu.
const { buatCache } = require("./cache");
const { normalisasiBarang, normalisasiKeuangan, normalisasiTransaksi } = require("./normalisasi");

const repo = { db: null, barang: null, keuangan: null, transaksi: null };

async function mulai({ db } = {}) {
  repo.db = db || require("../config/firebase").getDb();
  repo.barang = buatCache(repo.db, "barang", { normalisasi: normalisasiBarang });
  repo.keuangan = buatCache(repo.db, "keuangan", { normalisasi: normalisasiKeuangan });
  repo.transaksi = buatCache(repo.db, "transaksi", { normalisasi: normalisasiTransaksi });

  const [b, k, t] = await Promise.all([repo.barang.siap, repo.keuangan.siap, repo.transaksi.siap]);
  return { barang: b.jumlah, keuangan: k.jumlah, transaksi: t.jumlah };
}

function pasang(pengganti) {
  Object.assign(repo, pengganti);
}

module.exports = { repo, mulai, pasang };
