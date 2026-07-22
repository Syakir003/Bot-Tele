const { GoogleGenerativeAI } = require("@google/generative-ai");

const klienGemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelUtama = klienGemini.getGenerativeModel({ model: "gemini-flash-lite-latest" });

module.exports = { modelUtama };
