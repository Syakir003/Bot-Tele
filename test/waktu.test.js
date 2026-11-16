const test = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { parseTanggal, rentangPeriode, hariIni, tanggalDariMs, periodeValid } = require("../src/waktu");

// 2026-11-18 = hari Rabu
const ACUAN = dayjs("2026-11-18T10:00:00");

test("timezone proses dipaksa WIB", () => {
  assert.equal(process.env.TZ, "Asia/Jakarta");
  // 2026-11-14 23:30 UTC = 2026-11-15 06:30 WIB
  assert.equal(tanggalDariMs(Date.UTC(2026, 10, 14, 23, 30)), "2026-11-15");
});

test("parseTanggal: format yang diterima", () => {
  const kasus = [
    ["hari ini", "2026-11-18"],
    ["Kemarin", "2026-11-17"],
    ["kemarin lusa", "2026-11-16"],
    ["2 hari lalu", "2026-11-16"],
    ["2026-11-12", "2026-11-12"],
    ["12-11-2026", "2026-11-12"],
    ["12/11/2026", "2026-11-12"],
    ["12/11", "2026-11-12"],
    ["5-3", "2026-03-05"],
  ];
  for (const [masuk, harapan] of kasus) assert.equal(parseTanggal(masuk, ACUAN), harapan, masuk);
});

test("parseTanggal: tanggal tidak valid ditolak", () => {
  for (const masuk of ["", null, "31/02", "2026-02-30", "32/01", "13/13", "besok", "abc", "2026-13-01", "0/5"]) {
    assert.equal(parseTanggal(masuk, ACUAN), null, String(masuk));
  }
});

test("rentangPeriode", () => {
  assert.deepEqual(rentangPeriode("hari_ini", ACUAN), { dari: "2026-11-18", sampai: "2026-11-18" });
  // minggu mulai Senin: Rabu 18 -> Senin 16 s/d Minggu 22
  assert.deepEqual(rentangPeriode("minggu_ini", ACUAN), { dari: "2026-11-16", sampai: "2026-11-22" });
  assert.deepEqual(rentangPeriode("bulan_ini", ACUAN), { dari: "2026-11-01", sampai: "2026-11-30" });
  assert.deepEqual(rentangPeriode("bulan_lalu", ACUAN), { dari: "2026-10-01", sampai: "2026-10-31" });
  assert.equal(rentangPeriode("semua", ACUAN), null);
  assert.throws(() => rentangPeriode("tahun_depan", ACUAN));
});

test("rentangPeriode: batas pergantian tahun & hari Minggu", () => {
  const januari = dayjs("2027-01-10T08:00:00");
  assert.deepEqual(rentangPeriode("bulan_lalu", januari), { dari: "2026-12-01", sampai: "2026-12-31" });
  // Minggu 22 Nov 2026 masih masuk minggu yang mulai Senin 16
  const minggu = dayjs("2026-11-22T20:00:00");
  assert.deepEqual(rentangPeriode("minggu_ini", minggu), { dari: "2026-11-16", sampai: "2026-11-22" });
  assert.equal(hariIni(minggu), "2026-11-22");
});

test("periodeValid", () => {
  assert.equal(periodeValid("bulan_ini"), true);
  assert.equal(periodeValid("toString"), false); // jangan kena prototype
  assert.equal(periodeValid(undefined), false);
});
