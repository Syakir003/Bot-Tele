// Cache realtime satu node Firebase: download penuh sekali, setelah itu cuma delta lewat listener child_*.
// Semua pembacaan dari memori, jadi tidak ada network per aksi user.

function buatCache(db, path, { normalisasi = (item) => item, onGagal } = {}) {
  const ref = db.ref(path);
  const peta = new Map();
  let versi = 0;
  let arrayTersimpan = null;
  let arrayVersi = -1;

  const gagal =
    onGagal ||
    ((err) => {
      console.error(`[cache:${path}] listener Firebase gagal:`, err && err.message);
      process.exit(1); // biar PM2 restart; gagal diam-diam lebih bahaya daripada crash
    });

  function simpan(snap) {
    const nilai = snap.val();
    if (nilai === null || typeof nilai !== "object") {
      // bukan record valid (misal nilai primitif nyasar di node ini) -> abaikan
      if (peta.delete(snap.key)) versi++;
      return;
    }
    peta.set(snap.key, normalisasi({ id: snap.key, ...nilai }));
    versi++;
  }

  ref.on("child_added", simpan, gagal);
  ref.on("child_changed", simpan, gagal);
  ref.on(
    "child_removed",
    (snap) => {
      if (peta.delete(snap.key)) versi++;
    },
    gagal
  );

  // value baru terpanggil setelah semua child_added awal, jadi ini sinyal "cache siap"
  const siap = ref.once("value").then(() => ({ jumlah: peta.size }));

  const api = {
    path,
    siap,
    versi: () => versi,
    ukuran: () => peta.size,
    ambil: (id) => peta.get(id) || null,
    semua() {
      if (arrayVersi !== versi) {
        arrayTersimpan = Array.from(peta.values());
        arrayVersi = versi;
      }
      return arrayTersimpan;
    },
    // Hasil fungsi di-memo per argumen; otomatis dibuang kalau data berubah (versi naik)
    memo(fn) {
      let versiMemo = -1;
      let hasil = new Map();
      return (arg = "") => {
        if (versiMemo !== versi) {
          hasil = new Map();
          versiMemo = versi;
        }
        const kunci = JSON.stringify(arg);
        if (!hasil.has(kunci)) hasil.set(kunci, fn(arg));
        return hasil.get(kunci);
      };
    },
  };
  return api;
}

// Field turunan yang tidak ikut ter-spread / tertulis balik ke DB
function setTersembunyi(obj, nama, nilai) {
  Object.defineProperty(obj, nama, { value: nilai, enumerable: false, writable: true, configurable: true });
  return obj;
}

module.exports = { buatCache, setTersembunyi };
