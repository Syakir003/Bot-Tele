// Paginasi list bernomor. Tombol angka membawa ID item (bukan indeks), jadi tombol di list lama
// tidak pernah menunjuk item yang salah walau user sudah membuka list lain.
const { Markup } = require("telegraf");

const PER_HALAMAN = 8;
const PER_BARIS = 4;
const BATAS_TELEGRAM = 4096;

function jumlahHalaman(total) {
  return Math.max(1, Math.ceil(total / PER_HALAMAN));
}

// spek: { judul, items, formatBaris(item, nomor), prefiksDetail, kid, pesanKosong?, bawah?: array baris tombol }
// Balikan: { teks, tombol } (tombol = array baris Markup.button)
function bangunHalaman(spek, halaman = 0) {
  const total = spek.items.length;
  const semuaHalaman = jumlahHalaman(total);
  const h = Math.min(Math.max(0, halaman), semuaHalaman - 1);
  const mulai = h * PER_HALAMAN;
  const potong = spek.items.slice(mulai, mulai + PER_HALAMAN);

  const baris = potong.map((item, i) => spek.formatBaris(item, mulai + i + 1));
  let teks;
  if (total === 0) {
    teks = `${spek.judul}\n\n${spek.pesanKosong || "Tidak ada data."}`;
  } else {
    const info = semuaHalaman > 1 ? ` — hal ${h + 1}/${semuaHalaman}` : "";
    teks = `${spek.judul} (${total})${info}\n\n${baris.join("\n")}\n\n<i>Tap angka buat lihat detail.</i>`;
  }
  // Baris dipendekkan di format.js, jadi 8 baris selalu jauh di bawah batas; dijaga test (jangan dipotong
  // sembarang di sini: memotong di tengah tag HTML bikin Telegram menolak pesan).

  const tombol = [];
  let barisAngka = [];
  potong.forEach((item, i) => {
    barisAngka.push(Markup.button.callback(String(mulai + i + 1), `${spek.prefiksDetail}:${item.id}`));
    if (barisAngka.length === PER_BARIS) {
      tombol.push(barisAngka);
      barisAngka = [];
    }
  });
  if (barisAngka.length) tombol.push(barisAngka);

  if (semuaHalaman > 1) {
    tombol.push([
      h > 0 ? Markup.button.callback("⬅️", `hal:${spek.kid}:${h - 1}`) : Markup.button.callback("·", "noop"),
      Markup.button.callback(`${h + 1}/${semuaHalaman}`, "noop"),
      h < semuaHalaman - 1 ? Markup.button.callback("➡️", `hal:${spek.kid}:${h + 1}`) : Markup.button.callback("·", "noop"),
    ]);
  }
  for (const b of spek.bawah || []) tombol.push(b);

  return { teks, tombol, halaman: h };
}

module.exports = { bangunHalaman, jumlahHalaman, PER_HALAMAN, BATAS_TELEGRAM };
