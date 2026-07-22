const admin = require("firebase-admin");
const fs = require("fs");

function initFirebase() {
  if (admin.apps.length > 0) {
    return admin.database();
  }

  let kredensial;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const isiFile = fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8");
    kredensial = JSON.parse(isiFile);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    kredensial = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else {
    throw new Error(
      "Isi salah satu: FIREBASE_SERVICE_ACCOUNT_PATH atau FIREBASE_SERVICE_ACCOUNT_JSON di .env"
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(kredensial),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  return admin.database();
}

module.exports = { db: initFirebase() };
