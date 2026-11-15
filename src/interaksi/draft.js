// Logika murni (tanpa Telegram) untuk "draft": aksi tulis yang belum disimpan, dilengkapi lewat tanya-jawab,
// lalu dikonfirmasi user. Semua fungsi di sini bisa diuji tanpa bot.
const { parseJumlah, formatRupiah, esc } = require("../services/util");
const { parseTanggal } = require("../waktu");

const BATAS_PERINGATAN_BESAR = 1000000000; // 1 miliar
const SUFIKS_NOMINAL = /^(rb|ribu|jt|juta|k)$/i;

const FIELD = {
  jenis: { label: "Jenis", tipe: "jenis" },
  jumlah: { label: "Jumlah", tipe: "nominal" },
  keterangan: { label: "Keterangan", tipe: "teks", maks: 200 },
  kategori: { label: "Kategori", tipe: "teks", maks: 60 },
  tanggal: { label: "Tanggal", tipe: "tanggal" },
  merek: { label: "Merek", tipe: "teks", maks: 60, boleh_kosong: true },
  model: { label: "Model", tipe: "teks", maks: 80, boleh_kosong: true },
  harga: { label: "Harga jual", tipe: "nominal" },
  hargaBeli: { label: "Harga beli", tipe: "nominalNol" },
  stok: { label: "Stok", tipe: "bulat" },
  stokMinimal: { label: "Stok minimal", tipe: "bulat" },
  satuan: { label: "Satuan", tipe: "teks", maks: 20 },
};

const DEF = {
  tambah_keuangan: {
    judul: "Catat keuangan",
    wajib: ["jenis", "jumlah"],
    opsional: ["keterangan"], // ditanya sekali (bisa dilewati) kalau kosong
    ubah: ["jenis", "jumlah", "keterangan", "kategori"],
  },
  tambah_barang: {
    judul: "Tambah barang",
    wajib: ["merek", "model", "kategori", "harga", "stok"],
    opsional: [],
    ubah: ["merek", "model", "kategori", "harga", "stok", "hargaBeli", "stokMinimal", "satuan"],
  },
  edit_keuangan: { judul: "Ubah catatan keuangan", wajib: ["nilai"], opsional: [], ubah: [] },
  edit_barang: { judul: "Ubah barang", wajib: ["nilai"], opsional: [], ubah: [] },
};

const FIELD_EDIT_KEUANGAN = ["jumlah", "keterangan", "kategori", "tanggal", "jenis"];
const FIELD_EDIT_BARANG = ["harga", "stok", "merek", "model", "kategori", "hargaBeli", "stokMinimal", "satuan"];

function buatDraft(aksi, data = {}, id) {
  if (!DEF[aksi]) throw new Error(`Aksi draft tidak dikenal: ${aksi}`);
  return { id, aksi, data: { ...data }, diLewati: new Set() };
}

// Field mana yang jadi acuan validasi: untuk edit, "nilai" divalidasi sesuai field yang diedit
function kunciField(draft, f) {
  return f === "nilai" ? draft.data.field : f;
}

// Field berikutnya yang harus ditanyakan, atau null kalau sudah lengkap. {field, opsional}
function langkahBerikut(draft) {
  const def = DEF[draft.aksi];
  for (const f of def.wajib) {
    if (draft.data[f] === undefined) return { field: f, opsional: false };
  }
  for (const f of def.opsional) {
    if ((draft.data[f] === undefined || draft.data[f] === "") && !draft.diLewati.has(f)) return { field: f, opsional: true };
  }
  return null;
}

// "350rb servis ac" -> { jumlah: 350000, sisa: "servis ac" } ; "500 ribu" ; "Rp 350.000" ; "abc" -> jumlah 0
function pisahNominal(teks) {
  let t = String(teks || "").trim().split(/\s+/).filter(Boolean);
  if (t.length && /^rp\.?$/i.test(t[0])) t = t.slice(1);
  if (!t.length) return { jumlah: 0, sisa: "" };
  let mentah = t[0];
  let dipakai = 1;
  if (t.length > 1 && SUFIKS_NOMINAL.test(t[1])) {
    mentah += t[1];
    dipakai = 2;
  }
  return { jumlah: parseJumlah(mentah), sisa: t.slice(dipakai).join(" ") };
}

const gagal = (pesan) => ({ ok: false, pesan });

// Baca jawaban teks user untuk satu field. { ok:true, nilai, sisa? } | { ok:false, pesan } (pesan = HTML aman)
function bacaNilai(field, teks, draft) {
  const def = FIELD[field];
  if (!def) throw new Error(`Field tidak dikenal: ${field}`);
  const mentah = String(teks || "").trim();

  switch (def.tipe) {
    case "nominal": {
      const { jumlah, sisa } = pisahNominal(mentah);
      if (jumlah <= 0) return gagal("Itu belum kebaca sebagai nominal. Coba lagi, contoh: <b>350rb</b> atau <b>1.5jt</b>");
      return { ok: true, nilai: jumlah, sisa };
    }
    case "nominalNol": {
      if (/^(0|-)$/.test(mentah)) return { ok: true, nilai: 0 };
      const { jumlah } = pisahNominal(mentah);
      if (jumlah <= 0) return gagal("Itu belum kebaca sebagai nominal. Coba lagi, contoh: <b>120rb</b> (ketik <b>0</b> kalau kosong)");
      return { ok: true, nilai: jumlah };
    }
    case "bulat": {
      const token = mentah.split(/\s+/)[0] || "";
      if (!/^\d{1,9}$/.test(token)) return gagal("Harus angka bulat, contoh: <b>10</b>");
      return { ok: true, nilai: Number(token) };
    }
    case "tanggal": {
      const tgl = parseTanggal(mentah);
      if (!tgl) return gagal("Tanggal belum kebaca. Contoh: <b>kemarin</b>, <b>12/11</b>, atau <b>2026-11-12</b>");
      return { ok: true, nilai: tgl };
    }
    case "jenis": {
      const t = mentah.toLowerCase();
      if (/^(pemasukan|masuk|income)$/.test(t)) return { ok: true, nilai: "pemasukan" };
      if (/^(pengeluaran|keluar|expense)$/.test(t)) return { ok: true, nilai: "pengeluaran" };
      return gagal("Pilih <b>pemasukan</b> atau <b>pengeluaran</b>");
    }
    case "teks": {
      const rapi = mentah.replace(/\s+/g, " ");
      if (def.boleh_kosong && rapi === "-") {
        // merek/model boleh dikosongkan, tapi tidak boleh dua-duanya
        const lain = field === "merek" ? "model" : "merek";
        if (draft && draft.aksi === "tambah_barang" && draft.data[lain] === "") {
          return gagal("Merek dan model tidak boleh dua-duanya kosong");
        }
        return { ok: true, nilai: "" };
      }
      if (!rapi) return gagal(`${esc(def.label)} tidak boleh kosong`);
      if (rapi.length > def.maks) return gagal(`Terlalu panjang (maksimal ${def.maks} karakter)`);
      return { ok: true, nilai: rapi };
    }
    default:
      throw new Error(`Tipe field tidak dikenal: ${def.tipe}`);
  }
}

function pertanyaan(draft, f) {
  const field = kunciField(draft, f);
  const label = FIELD[field].label;
  if (draft.aksi === "tambah_keuangan" || draft.aksi === "tambah_barang") {
    const tanya = {
      jenis: "Ini pemasukan atau pengeluaran?",
      jumlah: "Berapa nominalnya? Contoh: <b>350rb</b> (boleh sekalian keterangan: <b>350rb servis AC</b>)",
      keterangan: "Keterangannya apa? Contoh: <b>servis AC pak budi</b>",
      kategori: "Kategorinya apa?",
      merek: "Merek barangnya apa? (ketik <b>-</b> kalau tidak ada merek)",
      model: "Model / nama barangnya apa? Contoh: <b>R32</b> (ketik <b>-</b> kalau tidak ada)",
      harga: "Harga jualnya berapa? Contoh: <b>150rb</b>",
      stok: "Stok awalnya berapa? Contoh: <b>10</b>",
      hargaBeli: "Harga belinya berapa? Contoh: <b>120rb</b> (ketik <b>0</b> kalau kosong)",
      stokMinimal: "Stok minimalnya berapa? Contoh: <b>3</b>",
      satuan: "Satuannya apa? Contoh: <b>pcs</b>, <b>unit</b>, <b>tabung</b>",
    };
    return tanya[field] || `Isi ${esc(label)}:`;
  }
  return `Ketik nilai baru untuk <b>${esc(label)}</b>:`;
}

// Tampilan satu nilai field (HTML aman)
function tampilNilai(field, nilai) {
  if (nilai === undefined || nilai === null || nilai === "") return "<i>(kosong)</i>";
  switch (FIELD[field]?.tipe) {
    case "nominal":
    case "nominalNol":
      return esc(formatRupiah(nilai));
    case "jenis":
      return nilai === "pemasukan" ? "🟢 Pemasukan" : "🔴 Pengeluaran";
    default:
      return esc(String(nilai));
  }
}

function peringatan(draft) {
  const d = draft.data;
  const hasil = [];
  const cek = (field, label) => {
    const n = d[field];
    if (typeof n !== "number") return;
    if (n > 0 && n < 1000) hasil.push(`${label} cuma ${formatRupiah(n)}. Maksudnya ${formatRupiah(n * 1000)}?`);
    if (n > BATAS_PERINGATAN_BESAR) hasil.push(`${label} ${formatRupiah(n)} besar sekali, pastikan sudah benar`);
  };
  if (draft.aksi === "tambah_keuangan") cek("jumlah", "Nominal");
  if (draft.aksi === "tambah_barang") {
    cek("harga", "Harga jual");
    cek("hargaBeli", "Harga beli");
  }
  if (draft.aksi === "edit_keuangan" && d.field === "jumlah") cek("nilai", "Nominal");
  if (draft.aksi === "edit_barang" && (d.field === "harga" || d.field === "hargaBeli")) cek("nilai", "Harga");
  return hasil;
}

// Kartu konfirmasi (HTML)
function teksPreview(draft, { tanggalHariIni } = {}) {
  const d = draft.data;
  let teks;

  if (draft.aksi === "tambah_keuangan") {
    teks =
      `📝 <b>Catat ini?</b>\n\n` +
      `${tampilNilai("jenis", d.jenis)} — <b>${esc(formatRupiah(d.jumlah))}</b>\n` +
      `Keterangan: ${tampilNilai("keterangan", d.keterangan)}\n` +
      `Kategori: ${tampilNilai("kategori", d.kategori || "Umum")}\n` +
      `Tanggal: ${esc(d.tanggal || tanggalHariIni || "hari ini")}`;
  } else if (draft.aksi === "tambah_barang") {
    teks =
      `📦 <b>Tambah barang ini?</b>\n\n` +
      `Merek: ${tampilNilai("merek", d.merek)}\n` +
      `Model: ${tampilNilai("model", d.model)}\n` +
      `Kategori: ${tampilNilai("kategori", d.kategori)}\n` +
      `Harga jual: ${tampilNilai("harga", d.harga)}\n` +
      `Harga beli: ${tampilNilai("hargaBeli", d.hargaBeli ?? 0)}\n` +
      `Stok: ${tampilNilai("stok", d.stok)} ${esc(d.satuan || "pcs")} (minimal: ${esc(d.stokMinimal ?? 0)})`;
  } else {
    const label = FIELD[d.field].label;
    teks =
      `✏️ <b>Ubah ${esc(label)}?</b>\n${esc(d.judulItem || "")}\n\n` +
      `Sekarang: ${tampilNilai(d.field, d.lama)}\n` +
      `Jadi: <b>${tampilNilai(d.field, d.nilai)}</b>`;
  }

  const catatan = peringatan(draft);
  if (catatan.length) teks += `\n\n⚠️ ${catatan.map(esc).join("\n⚠️ ")}`;
  return teks;
}

// Data siap tulis ke service setelah user menekan Simpan
function dataSimpan(draft) {
  const d = draft.data;
  if (draft.aksi === "tambah_keuangan") {
    return { jenis: d.jenis, jumlah: d.jumlah, keterangan: d.keterangan || "", kategori: d.kategori || "" };
  }
  if (draft.aksi === "tambah_barang") {
    return {
      merek: d.merek, model: d.model, kategori: d.kategori, harga: d.harga,
      hargaBeli: d.hargaBeli ?? 0, stok: d.stok, stokMinimal: d.stokMinimal ?? 0, satuan: d.satuan || "pcs",
    };
  }
  return { id: d.id, perubahan: { [d.field]: d.nilai } };
}

module.exports = {
  FIELD,
  DEF,
  FIELD_EDIT_KEUANGAN,
  FIELD_EDIT_BARANG,
  buatDraft,
  kunciField,
  langkahBerikut,
  pisahNominal,
  bacaNilai,
  pertanyaan,
  tampilNilai,
  peringatan,
  teksPreview,
  dataSimpan,
};
