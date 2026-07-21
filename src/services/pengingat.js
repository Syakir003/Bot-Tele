const { db } = require("../config/firebase");
const dayjs = require("dayjs");

async function buatPengingat(telegramId, { isi, waktu }) {
  const ref = db.ref(`pengingat/${telegramId}`).push();
  const data = {
    isi,
    waktu, // format ISO
    status: "aktif",
    dibuatPada: dayjs().format(),
  };
  await ref.set(data);
  return { id: ref.key, ...data };
}

async function listPengingatAktif(telegramId) {
  const snapshot = await db
    .ref(`pengingat/${telegramId}`)
    .orderByChild("status")
    .equalTo("aktif")
    .once("value");
  const semuaData = snapshot.val() || {};
  return Object.entries(semuaData).map(([id, val]) => ({ id, ...val }));
}

// Dipanggil cron tiap menit: cari semua pengingat aktif dari semua user yang sudah lewat waktunya
async function ambilPengingatJatuhTempo() {
  const snapshot = await db.ref("pengingat").once("value");
  const semuaUser = snapshot.val() || {};
  const sekarang = dayjs();
  const hasil = [];

  for (const [telegramId, daftarPengingat] of Object.entries(semuaUser)) {
    for (const [id, item] of Object.entries(daftarPengingat)) {
      if (item.status === "aktif" && dayjs(item.waktu).isBefore(sekarang)) {
        hasil.push({ telegramId, id, ...item });
      }
    }
  }
  return hasil;
}

async function tandaiSelesai(telegramId, id) {
  await db.ref(`pengingat/${telegramId}/${id}/status`).set("selesai");
}

module.exports = {
  buatPengingat,
  listPengingatAktif,
  ambilPengingatJatuhTempo,
  tandaiSelesai,
};
