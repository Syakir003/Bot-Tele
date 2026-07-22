require("dotenv").config();
const { db } = require("./src/config/firebase");

db.ref("/").once("value", (snapshot) => {
  console.log(JSON.stringify(snapshot.val(), null, 2));
  process.exit(0);
});
