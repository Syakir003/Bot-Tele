const admin = require("firebase-admin");
const fs = require("fs");

function initFirebase() {
  if (admin.apps.length > 0) return admin.database();

  const kredensial = JSON.parse(
    fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(kredensial),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  return admin.database();
}

module.exports = { db: initFirebase() };
