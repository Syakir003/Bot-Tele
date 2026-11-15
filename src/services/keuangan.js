const dayjs = require("dayjs");
const { repo } = require("../data/repo");
const { arsipkan, pulihkanDariArsip } = require("../data/arsip");
const { normalisasiKeuangan } = require("../data/normalisasi");
const { hariIni, rentangPeriode, parseTanggal } = require("../waktu");

const JENIS = ["pemasukan", "pengeluaran"];
const FIELD_DIIZINKAN = ["jenis", "jumlah", "kategori", "keterangan", "tanggal"];

// Filter berdasarkan periode ("hari_ini" | "minggu_ini" | "bulan_ini" | "bulan_lalu" | "semua").
// Record tanpa tanggal valid tidak ikut periode manapun kecuali "semua".
function dalamPeriode(daftar, periode) {
  const rentang = rentangPeriode(periode);
  if (!rentang) return daftar;
  return daftar.filter((k) => k.tanggal && k.tanggal >= rentang.dari && k.tanggal <= rentang.sampai);
}

// --- LIHAT / REKAP ---
function rekapKeuangan({ periode = "bulan_ini" } = {}) {
  const daftar = dalamPeriode(repo.keuangan.semua(), periode);

  let totalPemasukan = 0;
  let totalPengeluaran = 0;
  for (const k of daftar) {
    if (k.jenis === "pemasukan") totalPemasukan += k.jumlah;
    else if (k.jenis === "pengeluaran") totalPengeluaran += k.jumlah;
  }

  return {
    periode,
    totalPemasukan,
    totalPengeluaran,
    saldoBersih: totalPemasukan - totalPengeluaran,
    jumlahTransaksi: daftar.length,
  };
}

// Terbaru dulu: tanggal, lalu waktu dibuat, lalu ID push (kronologis)
function urutTerbaru(a, b) {
  return (
    b.tanggal.localeCompare(a.tanggal) ||
    String(b.dibuatPada || "").localeCompare(String(a.dibuatPada || "")) ||
    b.id.localeCompare(a.id)
  );
}

function riwayatKeuangan({ jenis = null, periode = "semua" } = {}) {
  let daftar = dalamPeriode(repo.keuangan.semua(), periode);
  if (jenis) daftar = daftar.filter((k) => k.jenis === jenis);
  return [...daftar].sort(urutTerbaru);
}

function ambilKeuanganById(id) {
  return repo.keuangan.ambil(id);
}

// --- TAMBAH ---
async function catatKeuangan({ jenis, jumlah, kategori, keterangan, tanggal }) {
  if (!JENIS.includes(jenis)) throw new Error("Jenis harus pemasukan atau pengeluaran");
  const nominal = Number(jumlah);
  if (!Number.isFinite(nominal) || nominal <= 0) throw new Error("Jumlah harus lebih dari 0");

  const ref = repo.db.ref("keuangan").push();
  const data = {
    jenis,
    jumlah: Math.round(nominal),
    kategori: String(kategori || "").trim() || "Umum",
    keterangan: String(keterangan || "").trim(),
    tanggal: tanggal || hariIni(),
    dibuatPada: dayjs().format(),
  };
  await ref.set(data);
  return normalisasiKeuangan({ id: ref.key, ...data });
}

// --- EDIT ---
async function editKeuangan(id, perubahan) {
  const data = ambilKeuanganById(id);
  if (!data) return null;

  const update = {};
  for (const [key, val] of Object.entries(perubahan)) {
    if (!FIELD_DIIZINKAN.includes(key)) continue;
    if (key === "jumlah") {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Jumlah harus lebih dari 0");
      update.jumlah = Math.round(n);
    } else if (key === "jenis") {
      if (!JENIS.includes(val)) throw new Error("Jenis harus pemasukan atau pengeluaran");
      update.jenis = val;
    } else if (key === "tanggal") {
      const tgl = parseTanggal(val);
      if (!tgl) throw new Error("Format tanggal tidak valid");
      update.tanggal = tgl;
    } else {
      update[key] = String(val ?? "").trim();
    }
  }
  if (Object.keys(update).length === 0) throw new Error("Tidak ada field yang bisa diubah");

  await repo.db.ref(`keuangan/${id}`).update(update);
  return normalisasiKeuangan({ ...data, ...update });
}

// --- HAPUS (soft delete) & URUNGKAN ---
async function hapusKeuangan(id) {
  const data = ambilKeuanganById(id);
  if (!data) return null;
  const mentah = await arsipkan(repo.db, "keuangan", id);
  return mentah ? data : null;
}

async function pulihkanKeuangan(id) {
  const mentah = await pulihkanDariArsip(repo.db, "keuangan", id);
  return mentah ? normalisasiKeuangan({ id, ...mentah }) : null;
}

module.exports = {
  JENIS,
  rekapKeuangan,
  riwayatKeuangan,
  ambilKeuanganById,
  catatKeuangan,
  editKeuangan,
  hapusKeuangan,
  pulihkanKeuangan,
};
