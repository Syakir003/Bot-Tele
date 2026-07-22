const { GoogleGenerativeAI } = require("@google/generative-ai");

const klienGemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model ringan & gratis, cukup buat chat + parsing intent
const modelUtama = klienGemini.getGenerativeModel({ model: "gemini-flash-lite-latest" });

module.exports = { modelUtama };
