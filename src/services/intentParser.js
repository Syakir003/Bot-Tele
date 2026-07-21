const { modelUtama } = require("../config/gemini");
const dayjs = require("dayjs");

const PROMPT_SISTEM = `Kamu adalah pengklasifikasi niat pesan untuk bot asisten pribadi bernama Kronik.
Tugasmu HANYA mengembalikan JSON valid, tanpa teks lain, tanpa markdown backticks.

Klasifikasikan pesan user ke salah satu dari 3 intent:

1. "pengeluaran" - kalau user cerita/catat pengeluaran uang. Ekstrak:
   - jumlah (angka, dalam Rupiah, contoh "20rb" jadi 20000)
   - kategori (contoh: makan, transport, jajan, belanja, tagihan, hiburan, lainnya)
   - keterangan (deskripsi singkat, boleh sama dengan pesan asli)

2. "pengingat" - kalau user minta diingatkan sesuatu di waktu tertentu. Ekstrak:
   - isi (isi pengingatnya)
   - waktu (format ISO 8601 lengkap dengan tanggal, patokan sekarang: ${dayjs().format()}, timezone Asia/Jakarta / WIB (+07:00))

3. "chat" - selain dua di atas, obrolan/pertanyaan biasa. Tidak perlu field tambahan.

Format output WAJIB:
{"intent": "pengeluaran" | "pengingat" | "chat", "data": { ... field sesuai intent, kosong {} kalau chat }}

Kalau pesan ambigu atau kurang informasi buat pengeluaran/pengingat (misal ga ada jumlah/waktu), fallback ke intent "chat".`;

async function klasifikasiPesan(teksUser) {
  const hasil = await modelUtama.generateContent([
    { text: PROMPT_SISTEM },
    { text: `Pesan user: "${teksUser}"` },
  ]);

  const teksMentah = hasil.response.text().trim();
  const teksBersih = teksMentah.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(teksBersih);
  } catch (err) {
    // Kalau AI ga ngasih JSON valid, anggap aja ini chat biasa
    return { intent: "chat", data: {} };
  }
}

module.exports = { klasifikasiPesan };
