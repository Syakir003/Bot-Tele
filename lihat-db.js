require("dotenv").config();
const { getDb } = require("./src/config/firebase");

getDb()
  .ref("/")
  .once("value", (snapshot) => {
    console.log(JSON.stringify(snapshot.val(), null, 2));
    process.exit(0);
  });
