// Sesi per user, in-memory. Kedaluwarsa 10 menit setelah interaksi terakhir.
// (Bot jalan satu proses di PM2; hilang saat restart itu wajar karena umur sesi cuma beberapa menit.)
const TTL_MS = 10 * 60 * 1000;
const MAKS_KUERI = 30;

function idBaru() {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}

function buatManajerSesi({ sekarang = Date.now, ttl = TTL_MS } = {}) {
  const peta = new Map();

  const kosong = () => ({
    langkah: null, // langkah input yang sedang ditunggu: "isi_draft" | "cari_barang" | ...
    ctx: null, // data tambahan untuk langkah itu, mis. { field }
    draft: null,
    kueri: new Map(), // kid -> spesifikasi list/opsi (untuk paginasi & tombol pilihan)
    kadaluarsa: 0,
  });

  return {
    ambil(userId) {
      const kunci = String(userId);
      let s = peta.get(kunci);
      if (!s || s.kadaluarsa <= sekarang()) {
        s = kosong();
        peta.set(kunci, s);
      }
      s.kadaluarsa = sekarang() + ttl;
      return s;
    },
    reset(userId) {
      peta.set(String(userId), { ...kosong(), kadaluarsa: sekarang() + ttl });
    },
    // batalkan alur input yang sedang jalan, tapi pertahankan kueri (supaya paginasi list lama tetap hidup)
    bersihkanAlur(userId) {
      const s = this.ambil(userId);
      s.langkah = null;
      s.ctx = null;
      s.draft = null;
      return s;
    },
    simpanKueri(s, spek) {
      const kid = idBaru();
      s.kueri.set(kid, spek);
      while (s.kueri.size > MAKS_KUERI) s.kueri.delete(s.kueri.keys().next().value);
      return kid;
    },
  };
}

module.exports = { buatManajerSesi, idBaru, TTL_MS };
