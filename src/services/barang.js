const dayjs = require("dayjs");
const { repo } = require("../data/repo");
const { arsipkan, pulihkanDariArsip } = require("../data/arsip");
const { normalisasiBarang } = require("../data/normalisasi");

const FIELD_DIIZINKAN = ["merek", "model", "kategori", "harga", "hargaBeli", "stok", "stokMinimal", "satuan", "barcode", "keterangan", "pk"];
const FIELD_ANGKA = ["harga", "hargaBeli", "stok", "stokMinimal"];

function kataKunci(teks) {
  return String(teks || "").toLowerCase().split(/\s+/).filter(Boolean);
}

// --- LIHAT / CARI (semua dari cache di memori) ---
// Semua kata kunci harus ada (urutan bebas): "r32 freon" ketemu "Freon R32"
function cariBarang(teks, batas = 200) {
  const kunci = kataKunci(teks);
  return repo.barang
    .semua()
    .filter((b) => kunci.every((k) => b._teks.includes(k)))
    .slice(0, batas);
}

function ambilBarangById(id) {
  return repo.barang.ambil(id);
}

function stokRendah(batas = 200) {
  return repo.barang
    .semua()
    .filter((b) => b.stok !== null && b.stok <= (b.stokMinimal || 0))
    .slice(0, batas);
}

// --- BROWSE BERTINGKAT: kategori -> merek -> list barang ---
const hitungKategori = () => {
  const hitung = {};
  for (const b of repo.barang.semua()) {
    const k = b.kategori || "Lainnya";
    hitung[k] = (hitung[k] || 0) + 1;
  }
  return Object.entries(hitung)
    .map(([kategori, jumlah]) => ({ kategori, jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah);
};

const hitungMerek = (kategoriFilter) => {
  const hitung = {};
  for (const b of repo.barang.semua()) {
    if (kategoriFilter && b.kategori.toLowerCase() !== kategoriFilter.toLowerCase()) continue;
    const m = b.merek || "Lainnya";
    hitung[m] = (hitung[m] || 0) + 1;
  }
  return Object.entries(hitung)
    .map(([merek, jumlah]) => ({ merek, jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah);
};

// memo dibuat lazy karena repo.barang baru ada setelah mulai()
let memoKategori = null;
let memoMerek = null;
let cacheMemo = null;
function pastikanMemo() {
  if (cacheMemo !== repo.barang) {
    memoKategori = repo.barang.memo(hitungKategori);
    memoMerek = repo.barang.memo(hitungMerek);
    cacheMemo = repo.barang;
  }
}

function daftarKategori() {
  pastikanMemo();
  return memoKategori();
}

function daftarMerek(kategoriFilter = null) {
  pastikanMemo();
  return memoMerek(kategoriFilter || null);
}

function barangByFilter({ kategori = null, merek = null } = {}, batas = 500) {
  return repo.barang
    .semua()
    .filter((b) => {
      const cocokKategori = !kategori || b.kategori.toLowerCase() === kategori.toLowerCase();
      const cocokMerek = !merek || (b.merek || "Lainnya").toLowerCase() === merek.toLowerCase();
      return cocokKategori && cocokMerek;
    })
    .slice(0, batas);
}

// --- TAMBAH ---
async function tambahBarang({ merek, model, kategori, harga, hargaBeli, stok, stokMinimal, satuan, barcode, keterangan }) {
  if (!String(merek || "").trim() && !String(model || "").trim()) {
    throw new Error("Merek atau model barang wajib diisi");
  }
  const ref = repo.db.ref("barang").push();
  const data = {
    merek: String(merek || "").trim(),
    model: String(model || "").trim(),
    kategori: String(kategori || "").trim(),
    harga: Number(harga) || 0,
    hargaBeli: Number(hargaBeli) || 0,
    stok: Number(stok) || 0,
    stokMinimal: Number(stokMinimal) || 0,
    satuan: String(satuan || "").trim() || "pcs",
    barcode: barcode || "",
    keterangan: keterangan || "",
    dibuatPada: dayjs().format(),
  };
  await ref.set(data);
  return normalisasiBarang({ id: ref.key, ...data });
}

// --- EDIT ---
async function editBarang(id, perubahan) {
  const barang = ambilBarangById(id);
  if (!barang) return null;

  const update = {};
  for (const [key, val] of Object.entries(perubahan)) {
    if (!FIELD_DIIZINKAN.includes(key)) continue;
    if (FIELD_ANGKA.includes(key)) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) throw new Error(`Nilai ${key} tidak valid`);
      update[key] = n;
    } else {
      update[key] = String(val ?? "").trim();
    }
  }
  if (Object.keys(update).length === 0) throw new Error("Tidak ada field yang bisa diubah");

  await repo.db.ref(`barang/${id}`).update(update);
  return normalisasiBarang({ ...barang, ...update });
}

// --- HAPUS (soft delete) & URUNGKAN ---
async function hapusBarang(id) {
  const barang = ambilBarangById(id);
  if (!barang) return null;
  const mentah = await arsipkan(repo.db, "barang", id);
  return mentah ? barang : null;
}

async function pulihkanBarang(id) {
  const mentah = await pulihkanDariArsip(repo.db, "barang", id);
  return mentah ? normalisasiBarang({ id, ...mentah }) : null;
}

module.exports = {
  cariBarang,
  ambilBarangById,
  stokRendah,
  daftarKategori,
  daftarMerek,
  barangByFilter,
  tambahBarang,
  editBarang,
  hapusBarang,
  pulihkanBarang,
};
