const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL_BAWAAN = "gemini-flash-lite-latest";
let klien = null;

// Model dibuat per panggilan (murah) supaya bisa ganti skema/instruksi tanpa state global.
// temperature 0 + JSON mode: model cuma boleh ngeluarin JSON, bukan prosa.
function buatModel({ instruksi, skema }) {
  klien = klien || new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return klien.getGenerativeModel({
    model: process.env.GEMINI_MODEL || MODEL_BAWAAN,
    systemInstruction: instruksi,
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      ...(skema ? { responseSchema: skema } : {}),
    },
  });
}

module.exports = { buatModel };
