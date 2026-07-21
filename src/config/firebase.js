const admin = require("firebase-admin");

function initFirebase() {
  if (admin.apps.length > 0) {
    return admin.database();
  }

  const jsonMentah = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!jsonMentah) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON belum diisi di file .env"
    );
  }

  const kredensial = JSON.parse(jsonMentah);

  admin.initializeApp({
    credential: admin.credential.cert(kredensial),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  return admin.database();
}

module.exports = { db: initFirebase() };
