const dayjs = require("dayjs");

// Soft delete: pindahkan record ke <path>_terhapus/<id> (data mentah persis seperti di DB), lalu hapus aslinya.
async function arsipkan(db, path, id) {
  const snap = await db.ref(`${path}/${id}`).once("value");
  const mentah = snap.val();
  if (!mentah) return null;
  await db.ref(`${path}_terhapus/${id}`).set({ ...mentah, dihapusPada: dayjs().format() });
  await db.ref(`${path}/${id}`).remove();
  return mentah;
}

// Kebalikan arsipkan(). Null kalau tidak ada di arsip, atau ID itu sudah dipakai lagi di data aktif.
async function pulihkanDariArsip(db, path, id) {
  const [arsip, aktif] = await Promise.all([
    db.ref(`${path}_terhapus/${id}`).once("value"),
    db.ref(`${path}/${id}`).once("value"),
  ]);
  const mentah = arsip.val();
  if (!mentah || aktif.val()) return null;

  const { dihapusPada, ...asli } = mentah; // eslint-disable-line no-unused-vars
  await db.ref(`${path}/${id}`).set(asli);
  await db.ref(`${path}_terhapus/${id}`).remove();
  return asli;
}

module.exports = { arsipkan, pulihkanDariArsip };
