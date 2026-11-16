const test = require("node:test");
const assert = require("node:assert/strict");
const { buatFakeDb } = require("./helpers/fakeDb");
const { buatCache } = require("../src/data/cache");
const { mulai, repo } = require("../src/data/repo");
const barangSvc = require("../src/services/barang");
const keuanganSvc = require("../src/services/keuangan");
const transaksiSvc = require("../src/services/transaksi");
const dayjs = require("dayjs");
const { hariIni } = require("../src/waktu");

const MS = (tgl) => dayjs(`${tgl}T12:00:00`).valueOf();

function dataAwal() {
  return {
    barang: {
      b1: { merek: "Daikin", model: "FTV25 1PK", kategori: "AC", harga: "3500000", hargaBeli: 3000000, stok: 5, stokMinimal: 2, satuan: "unit" },
      b2: { merek: "Freon", model: "R32", kategori: "Freon", harga: 150000, stok: 1, stokMinimal: 3 },
      b3: { merek: "", model: "Kapasitor 25uf", kategori: "Sparepart", harga: 45000, stok: 0, stokMinimal: 0 },
      b4: { merek: "Jasa", model: "Servis", kategori: "Jasa", harga: 100000 }, // stok tidak ada -> bukan 'habis'
    },
    keuangan: {
      k1: { jenis: "pemasukan", jumlah: 350000, kategori: "Servis", keterangan: "servis pak budi", tanggal: "2026-11-18" },
      k2: { jenis: "pengeluaran", jumlah: "30000", keterangan: "bensin", tanggal: "2026-11-17" },
      k3: { jenis: "pemasukan", jumlah: 1000000, keterangan: "bulan lalu", tanggal: "2026-10-30" },
      k4: { jenis: "pengeluaran", jumlah: 5000, keterangan: "tanpa tanggal" },
    },
    transaksi: {
      t1: { nomorNota: "INV-001", pelanggan: "Pak Andi", total: 3500000, bayar: 4000000, kembali: 500000, tanggal: MS("2026-11-18"), items: [{ barang: { merek: "Daikin", model: "FTV25 1PK", harga: 3500000 }, jumlah: 1 }] },
      t2: { nomorNota: "INV-002", pelanggan: "Bu Sari", total: 150000, tanggal: MS("2026-11-17"), items: { 0: { barang: { merek: "Freon", model: "R32" }, jumlah: 1 } } },
    },
  };
}

async function siapkan(awal = dataAwal()) {
  const db = buatFakeDb(awal);
  await mulai({ db });
  return db;
}

test("cache: initial load, siap resolve, normalisasi tipe", async () => {
  const db = await siapkan();
  assert.equal(repo.barang.ukuran(), 4);
  const b1 = repo.barang.ambil("b1");
  assert.equal(b1.harga, 3500000); // "3500000" -> angka
  assert.equal(b1.id, "b1");
  assert.equal(repo.keuangan.ambil("k2").jumlah, 30000);
  assert.equal(repo.keuangan.ambil("k4").tanggal, ""); // tanpa tanggal
  assert.equal(repo.transaksi.ambil("t2").items.length, 1); // items object -> array
  assert.ok(db);
});

test("cache: _teks tidak ikut ter-spread / tertulis balik ke DB", async () => {
  await siapkan();
  const b = repo.barang.ambil("b1");
  assert.ok(b._teks.includes("daikin"));
  assert.equal(Object.keys({ ...b }).includes("_teks"), false);
});

test("cache: delta dari luar (add/change/remove) ter-update + versi naik + memo dibuang", async () => {
  const db = await siapkan();
  const v0 = repo.barang.versi();
  assert.equal(barangSvc.daftarKategori().find((k) => k.kategori === "AC").jumlah, 1);

  db.tulisLuar("barang/b9", { merek: "LG", model: "Dual Inverter", kategori: "AC", harga: 4000000, stok: 2 });
  assert.equal(repo.barang.ukuran(), 5);
  assert.ok(repo.barang.versi() > v0);
  assert.equal(barangSvc.daftarKategori().find((k) => k.kategori === "AC").jumlah, 2);

  db.tulisLuar("barang/b9", { merek: "LG", model: "Dual Inverter", kategori: "AC", harga: 4100000, stok: 2 });
  assert.equal(repo.barang.ambil("b9").harga, 4100000);

  db.tulisLuar("barang/b9", null);
  assert.equal(repo.barang.ambil("b9"), null);
  assert.equal(barangSvc.daftarKategori().find((k) => k.kategori === "AC").jumlah, 1);
});

test("cache: listener ditolak -> onGagal dipanggil", async () => {
  const db = buatFakeDb({ barang: {} });
  let galat = null;
  buatCache(db, "barang", { onGagal: (e) => (galat = e) });
  db.gagalkan(new Error("permission_denied"));
  assert.equal(galat.message, "permission_denied");
});

test("cache: node kosong tetap siap", async () => {
  const db = buatFakeDb({});
  const c = buatCache(db, "barang", {});
  const hasil = await c.siap;
  assert.equal(hasil.jumlah, 0);
  assert.deepEqual(c.semua(), []);
});

test("barang: cari semua kata kunci, urutan bebas, case-insensitive", async () => {
  await siapkan();
  assert.deepEqual(barangSvc.cariBarang("freon r32").map((b) => b.id), ["b2"]);
  assert.deepEqual(barangSvc.cariBarang("R32 FREON").map((b) => b.id), ["b2"]);
  assert.deepEqual(barangSvc.cariBarang("kapasitor").map((b) => b.id), ["b3"]);
  assert.deepEqual(barangSvc.cariBarang("tidak ada"), []);
  assert.equal(barangSvc.cariBarang("").length, 4); // kosong = semua
});

test("barang: stok rendah (stok <= minimal), item tanpa stok tidak dianggap habis", async () => {
  await siapkan();
  const ids = barangSvc.stokRendah().map((b) => b.id).sort();
  assert.deepEqual(ids, ["b2", "b3"]); // b3: stok 0 <= 0 ; b4 tanpa stok -> tidak ikut
});

test("barang: kategori & merek (merek kosong = Lainnya), filter", async () => {
  await siapkan();
  assert.equal(barangSvc.daftarKategori().length, 4);
  assert.deepEqual(barangSvc.daftarMerek("sparepart"), [{ merek: "Lainnya", jumlah: 1 }]);
  assert.deepEqual(barangSvc.barangByFilter({ kategori: "ac" }).map((b) => b.id), ["b1"]);
  assert.deepEqual(barangSvc.barangByFilter({ merek: "Lainnya" }).map((b) => b.id), ["b3"]);
});

test("barang: kategori 'Lainnya' (barang tanpa kategori) bisa dibuka dari daftar kategori", async () => {
  await siapkan({ barang: { a: { merek: "X", model: "1", kategori: "", harga: 1, stok: 1 }, b: { merek: "Y", model: "2", kategori: "AC", harga: 1, stok: 1 } } });
  const lainnya = barangSvc.daftarKategori().find((k) => k.kategori === "Lainnya");
  assert.equal(lainnya.jumlah, 1);
  assert.deepEqual(barangSvc.barangByFilter({ kategori: "Lainnya" }).map((b) => b.id), ["a"]);
  assert.deepEqual(barangSvc.daftarMerek("Lainnya"), [{ merek: "X", jumlah: 1 }]);
});

test("barang: tambah, edit, hapus, urungkan (round-trip ke DB)", async () => {
  const db = await siapkan();
  const baru = await barangSvc.tambahBarang({ merek: "Panasonic", model: "CS-PN5", kategori: "AC", harga: 3000000, stok: 4 });
  assert.equal(baru.satuan, "pcs");
  assert.ok(db._data.barang[baru.id]);
  assert.equal(repo.barang.ambil(baru.id).merek, "Panasonic");
  assert.equal(Object.keys(db._data.barang[baru.id]).includes("_teks"), false);

  const diedit = await barangSvc.editBarang(baru.id, { harga: 3200000, stok: "7", hacker: "x" });
  assert.equal(diedit.harga, 3200000);
  assert.equal(db._data.barang[baru.id].stok, 7);
  assert.equal(db._data.barang[baru.id].hacker, undefined); // field di luar allowlist ditolak

  await assert.rejects(() => barangSvc.editBarang(baru.id, { harga: "abc" }), /tidak valid/);
  await assert.rejects(() => barangSvc.editBarang(baru.id, { harga: -5 }), /tidak valid/);
  assert.equal(await barangSvc.editBarang("tidak-ada", { harga: 1 }), null);

  const terhapus = await barangSvc.hapusBarang(baru.id);
  assert.equal(terhapus.merek, "Panasonic");
  assert.equal(db._data.barang[baru.id], undefined);
  assert.ok(db._data.barang_terhapus[baru.id].dihapusPada);
  assert.equal(repo.barang.ambil(baru.id), null);

  const pulih = await barangSvc.pulihkanBarang(baru.id);
  assert.equal(pulih.model, "CS-PN5");
  assert.equal(db._data.barang[baru.id].harga, 3200000);
  assert.equal(db._data.barang_terhapus[baru.id], undefined);
  assert.equal(db._data.barang[baru.id].dihapusPada, undefined);
  assert.equal(repo.barang.ambil(baru.id).harga, 3200000);
});

test("barang: tambah tanpa merek & model ditolak; pulihkan yang tidak ada = null", async () => {
  await siapkan();
  await assert.rejects(() => barangSvc.tambahBarang({ kategori: "AC" }), /wajib/);
  assert.equal(await barangSvc.pulihkanBarang("nope"), null);
  assert.equal(await barangSvc.hapusBarang("nope"), null);
});

test("keuangan: rekap per periode memakai tanggal WIB, record tanpa tanggal hanya di 'semua'", async () => {
  await siapkan();
  const acuan = dayjs("2026-11-18T10:00:00");
  // rekap pakai 'sekarang' asli, jadi cek lewat riwayat + rentang eksplisit di bawah; di sini cek 'semua'
  const semua = keuanganSvc.rekapKeuangan({ periode: "semua" });
  assert.equal(semua.totalPemasukan, 1350000);
  assert.equal(semua.totalPengeluaran, 35000); // 30000 + 5000 (k4 tanpa tanggal ikut 'semua')
  assert.equal(semua.jumlahTransaksi, 4);
  assert.ok(acuan.isValid());
});

test("keuangan: riwayat terurut terbaru dulu + filter jenis", async () => {
  await siapkan();
  const masuk = keuanganSvc.riwayatKeuangan({ jenis: "pemasukan" });
  assert.deepEqual(masuk.map((k) => k.id), ["k1", "k3"]);
  const semua = keuanganSvc.riwayatKeuangan();
  assert.deepEqual(semua.map((k) => k.id), ["k1", "k2", "k3", "k4"]); // k4 tanpa tanggal paling bawah
});

test("keuangan: periode hari_ini / bulan_ini ikut tanggal hari ini (WIB)", async () => {
  const hari = hariIni();
  const db = await siapkan({
    keuangan: {
      a: { jenis: "pemasukan", jumlah: 100000, tanggal: hari },
      b: { jenis: "pengeluaran", jumlah: 40000, tanggal: hari },
      c: { jenis: "pemasukan", jumlah: 999000, tanggal: "2020-01-01" },
    },
  });
  assert.ok(db);
  const r = keuanganSvc.rekapKeuangan({ periode: "hari_ini" });
  assert.equal(r.totalPemasukan, 100000);
  assert.equal(r.totalPengeluaran, 40000);
  assert.equal(r.saldoBersih, 60000);
  assert.equal(keuanganSvc.rekapKeuangan({ periode: "bulan_ini" }).jumlahTransaksi, 2);
  assert.equal(keuanganSvc.riwayatKeuangan({ periode: "hari_ini" }).length, 2);
});

test("keuangan: catat, validasi, edit, hapus, urungkan", async () => {
  const db = await siapkan();
  const h = await keuanganSvc.catatKeuangan({ jenis: "pemasukan", jumlah: 350000, keterangan: "servis" });
  assert.equal(h.tanggal, hariIni());
  assert.equal(h.kategori, "Umum");
  assert.equal(db._data.keuangan[h.id].jumlah, 350000);

  await assert.rejects(() => keuanganSvc.catatKeuangan({ jenis: "apa", jumlah: 1000 }), /Jenis/);
  await assert.rejects(() => keuanganSvc.catatKeuangan({ jenis: "pemasukan", jumlah: 0 }), /Jumlah/);
  await assert.rejects(() => keuanganSvc.catatKeuangan({ jenis: "pemasukan", jumlah: "abc" }), /Jumlah/);

  const e = await keuanganSvc.editKeuangan(h.id, { jumlah: "400000", jenis: "pengeluaran", tanggal: "12/11/2026" });
  assert.equal(e.jumlah, 400000);
  assert.equal(e.jenis, "pengeluaran");
  assert.equal(e.tanggal, "2026-11-12");
  await assert.rejects(() => keuanganSvc.editKeuangan(h.id, { tanggal: "31/02/2026" }), /tanggal/);
  await assert.rejects(() => keuanganSvc.editKeuangan(h.id, { jenis: "x" }), /Jenis/);

  await keuanganSvc.hapusKeuangan(h.id);
  assert.equal(db._data.keuangan[h.id], undefined);
  const pulih = await keuanganSvc.pulihkanKeuangan(h.id);
  assert.equal(pulih.jumlah, 400000);
  assert.equal(repo.keuangan.ambil(h.id).jenis, "pengeluaran");
});

test("transaksi: cari, terbaru, nota, tanggal", async () => {
  await siapkan();
  assert.deepEqual(transaksiSvc.cariTransaksi("andi").map((t) => t.id), ["t1"]);
  assert.deepEqual(transaksiSvc.cariTransaksi("freon").map((t) => t.id), ["t2"]);
  assert.deepEqual(transaksiSvc.cariTransaksi("inv-00").map((t) => t.id), ["t1", "t2"]);
  assert.deepEqual(transaksiSvc.transaksiTerbaru(1).map((t) => t.id), ["t1"]);
  assert.equal(transaksiSvc.ambilInvoice("inv-002").pelanggan, "Bu Sari");
  assert.equal(transaksiSvc.ambilInvoice("zzz"), null);
  assert.equal(transaksiSvc.ambilInvoice(""), null);
  assert.deepEqual(transaksiSvc.transaksiByTanggal("2026-11-17").map((t) => t.id), ["t2"]);
  assert.deepEqual(transaksiSvc.transaksiByTanggal("2026-01-01"), []);
});
