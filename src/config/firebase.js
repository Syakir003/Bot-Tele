const admin = require("firebase-admin");
const fs = require("fs");

// Kredensial: FIREBASE_SERVICE_ACCOUNT_JSON (isi JSON satu baris) kalau ada,
// kalau tidak pakai FIREBASE_SERVICE_ACCOUNT_PATH (path file, setup VPS sekarang).
function muatKredensial() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"));
  }
  throw new Error("Isi FIREBASE_SERVICE_ACCOUNT_PATH (path file) atau FIREBASE_SERVICE_ACCOUNT_JSON di .env");
}

// Lazy: baru konek Firebase waktu dipanggil (jadi modul lain bisa di-import tanpa kredensial, misal buat test)
function getDb() {
  if (admin.apps.length > 0) return admin.database();

  admin.initializeApp({
    credential: admin.credential.cert(muatKredensial()),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  return admin.database();
}

module.exports = { getDb };
