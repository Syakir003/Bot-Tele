// Perakitan bot Telegram HDB Airconds. Dipisah dari bot.js (entry point) supaya bisa diuji tanpa jaringan.
const { Telegraf, Markup } = require("telegraf");

const { esc, formatRupiah } = require("./services/util");
const barangSvc = require("./services/barang");
const keuanganSvc = require("./services/keuangan");
const transaksiSvc = require("./services/transaksi");
const draftLib = require("./interaksi/draft");
const { buatManajerSesi, idBaru } = require("./interaksi/sesi");
const fmt = require("./tampilan/format");
const { bangunHalaman } = require("./tampilan/daftar");
const { parseTanggal, hariIni, periodeValid, PERIODE } = require("./waktu");
const dayjs = require("dayjs");

const HTML = { parse_mode: "HTML" };

const TEKS = {
  sapa:
    "Halo! 👋 Aku asisten <b>HDB Airconds</b>: bantu urusan barang, keuangan, dan transaksi.\n\n" +
    "Pilih menu di bawah, atau ketik langsung, misalnya:\n" +
    "• <i>servis AC pak budi dapet 350rb</i>\n• <i>cek stok freon</i>\n• <i>rekap bulan ini</i>",
  diLuar: "Aku cuma bisa bantu urusan <b>HDB Airconds</b>: barang, keuangan, dan transaksi. 🙏",
  terbatas: "Pembaca perintah otomatis lagi terbatas. Pakai menu di bawah dulu ya. 🙏",
  tidakJelas: "Aku belum yakin maksudnya. Mau yang mana?",
  kadaluarsa: "Sesi sudah kedaluwarsa, ulangi dari menu ya.",
  tokenBasi: "Kartu ini sudah tidak berlaku (sesi habis atau sudah diganti). Ulangi ya.",
};

function buatBot({ token, ownerId, nlu, sesi = buatManajerSesi(), log = console }) {
  const bot = new Telegraf(token);

  // ==================== HELPER KIRIM ====================
  const balas = (ctx, teks, extra = {}) => ctx.reply(teks, { ...HTML, ...extra });

  async function sunting(ctx, teks, extra = {}) {
    try {
      return await ctx.editMessageText(teks, { ...HTML, ...extra });
    } catch (err) {
      if (/message is not modified/i.test(err.message || "")) return null;
      return balas(ctx, teks, extra); // pesan asal tidak bisa diedit -> kirim baru
    }
  }

  const keyboard = (baris) => (baris.length ? Markup.inlineKeyboard(baris) : {});
  const tombol = (label, data) => Markup.button.callback(label, data);
  const toast = (ctx, teks) => ctx.answerCbQuery(teks).catch(() => {});

  // action: jawab spinner tombol setelah selesai (kalau handler belum menjawab sendiri lewat toast)
  function aksi(pola, fn) {
    bot.action(pola, async (ctx) => {
      try {
        await fn(ctx);
      } finally {
        await ctx.answerCbQuery().catch(() => {});
      }
    });
  }

  // ==================== GERBANG OWNER (fail-closed) ====================
  bot.use((ctx, next) => {
    const id = String(ctx.from?.id || "");
    const teks = ctx.message?.text || "";
    if (!ownerId) {
      // OWNER_TELEGRAM_ID belum diisi: bot terkunci, kecuali /myid supaya ID bisa diambil untuk setup
      return /^\/myid(@\w+)?(\s|$)/.test(teks) ? next() : undefined;
    }
    if (id !== String(ownerId)) return undefined;
    return next();
  });

  // ==================== MENU ====================
  const menuUtama = () =>
    Markup.inlineKeyboard([
      [tombol("💰 Keuangan", "menu:keuangan"), tombol("📦 Barang", "menu:barang")],
      [tombol("🧾 Transaksi", "menu:transaksi"), tombol("📊 Grafik", "aksi:grafik")],
    ]);
  const menuKeuangan = () =>
    Markup.inlineKeyboard([
      [tombol("📈 Rekap", "aksi:rekap")],
      [tombol("🟢 Lihat Pemasukan", "aksi:list_masuk"), tombol("🔴 Lihat Pengeluaran", "aksi:list_keluar")],
      [tombol("➕ Catat Pemasukan", "input:masuk"), tombol("➖ Catat Pengeluaran", "input:keluar")],
      [tombol("« Kembali", "menu:utama")],
    ]);
  const menuBarang = () =>
    Markup.inlineKeyboard([
      [tombol("📂 Browse Kategori", "aksi:browse_kategori")],
      [tombol("🏷️ Browse Merek", "aksi:browse_merek")],
      [tombol("🔍 Cari Barang", "input:cari_barang")],
      [tombol("⚠️ Stok Menipis", "aksi:stok_rendah")],
      [tombol("➕ Tambah Barang", "input:tambah_barang")],
      [tombol("« Kembali", "menu:utama")],
    ]);
  const menuTransaksi = () =>
    Markup.inlineKeyboard([
      [tombol("📋 Transaksi Terbaru", "aksi:transaksi_terbaru")],
      [tombol("🔍 Cari Transaksi", "input:cari_transaksi")],
      [tombol("📅 Cari per Tanggal", "input:tanggal_transaksi")],
      [tombol("« Kembali", "menu:utama")],
    ]);

  const tombolItemKeuangan = (id) => Markup.inlineKeyboard([[tombol("✏️ Edit", `ek:${id}`), tombol("🗑️ Hapus", `hk:${id}`)]]);
  const tombolItemBarang = (id) => Markup.inlineKeyboard([[tombol("✏️ Edit", `eb:${id}`), tombol("🗑️ Hapus", `hb:${id}`)]]);

  const kirimMenu = (ctx, teks = TEKS.sapa) => balas(ctx, teks, menuUtama());

  // ==================== DRAFT (tulis ke DB selalu lewat konfirmasi) ====================
  const stateDraft = (ctx) => sesi.ambil(ctx.from.id);

  // Kembalikan sesi bila draft dengan ID ini masih aktif; kalau tidak, kasih tahu user
  async function draftAktif(ctx, id) {
    const s = stateDraft(ctx);
    if (s.draft && s.draft.id === id) return s;
    await toast(ctx, TEKS.tokenBasi);
    return null;
  }

  function mulaiDraft(ctx, aksiDraft, data) {
    const s = sesi.bersihkanAlur(ctx.from.id);
    s.draft = draftLib.buatDraft(aksiDraft, data, idBaru());
    return lanjutDraft(ctx);
  }

  async function lanjutDraft(ctx) {
    const s = stateDraft(ctx);
    const dr = s.draft;
    if (!dr) return balas(ctx, TEKS.kadaluarsa, menuUtama());
    const f = draftLib.langkahBerikut(dr);
    if (!f) {
      s.langkah = null;
      s.ctx = null;
      return kirimPreview(ctx, dr);
    }
    return tanyaField(ctx, dr, f);
  }

  async function kirimPreview(ctx, dr) {
    dr.id = idBaru(); // kartu lama otomatis basi
    const tombolKartu =
      dr.aksi === "edit_keuangan" || dr.aksi === "edit_barang"
        ? [[tombol("✅ Simpan", `ok:${dr.id}`), tombol("❌ Batal", `bt:${dr.id}`)]]
        : [[tombol("✅ Simpan", `ok:${dr.id}`), tombol("✏️ Ubah", `ub:${dr.id}`), tombol("❌ Batal", `bt:${dr.id}`)]];
    return balas(ctx, draftLib.teksPreview(dr, { tanggalHariIni: hariIni() }), Markup.inlineKeyboard(tombolKartu));
  }

  async function tanyaField(ctx, dr, f, awalan = "") {
    const s = stateDraft(ctx);
    dr.id = idBaru();
    s.langkah = "isi_draft";
    s.ctx = { field: f.field };

    const kunci = draftLib.kunciField(dr, f.field);
    const batal = tombol("❌ Batal", `bt:${dr.id}`);
    const pembuka = awalan ? `${awalan}\n\n` : "";

    if (kunci === "jenis") {
      return balas(
        ctx,
        `${pembuka}${draftLib.pertanyaan(dr, f.field)}`,
        Markup.inlineKeyboard([[tombol("🟢 Pemasukan", `dj:${dr.id}:masuk`), tombol("🔴 Pengeluaran", `dj:${dr.id}:keluar`)], [batal]])
      );
    }

    const untukBarang = dr.aksi === "tambah_barang" || dr.aksi === "edit_barang";
    if (kunci === "kategori" && untukBarang) {
      const nama = barangSvc.daftarKategori().map((k) => k.kategori).filter((k) => k !== "Lainnya").slice(0, 12);
      if (nama.length) {
        dr.opsiKategori = nama;
        const baris = [];
        for (let i = 0; i < nama.length; i += 2) {
          baris.push(nama.slice(i, i + 2).map((n, j) => tombol(n, `dk:${dr.id}:${i + j}`)));
        }
        baris.push([tombol("➕ Kategori baru", `dk:${dr.id}:baru`), batal]);
        return balas(ctx, `${pembuka}Pilih kategori, atau ketik langsung:`, Markup.inlineKeyboard(baris));
      }
    }

    const baris = [];
    if (f.opsional) baris.push(tombol("⏭️ Lewati", `lw:${dr.id}:${f.field}`));
    baris.push(batal);
    return balas(ctx, `${pembuka}${draftLib.pertanyaan(dr, f.field)}`, Markup.inlineKeyboard([baris]));
  }

  // Jawaban teks untuk pertanyaan draft yang sedang terbuka
  async function jawabDraft(ctx, s, teks) {
    const dr = s.draft;
    const f = s.ctx && s.ctx.field;
    if (!dr || !f) {
      sesi.bersihkanAlur(ctx.from.id);
      return kirimMenu(ctx, TEKS.kadaluarsa);
    }
    const kunci = draftLib.kunciField(dr, f);
    const hasil = draftLib.bacaNilai(kunci, teks, dr);
    if (!hasil.ok) {
      const opsional = draftLib.DEF[dr.aksi].opsional.includes(f);
      return tanyaField(ctx, dr, { field: f, opsional }, hasil.pesan);
    }
    dr.data[f] = hasil.nilai;
    if (kunci === "jumlah" && dr.aksi === "tambah_keuangan" && hasil.sisa && !dr.data.keterangan) {
      dr.data.keterangan = hasil.sisa; // "350rb servis AC" -> nominal + keterangan sekaligus
    }
    return lanjutDraft(ctx);
  }

  aksi(/^bt:(\w+)$/, async (ctx) => {
    if (!(await draftAktif(ctx, ctx.match[1]))) return;
    sesi.bersihkanAlur(ctx.from.id);
    await sunting(ctx, "Baik, dibatalkan. 👍");
  });

  aksi(/^dj:(\w+):(masuk|keluar)$/, async (ctx) => {
    const s = await draftAktif(ctx, ctx.match[1]);
    if (!s) return;
    s.draft.data.jenis = ctx.match[2] === "masuk" ? "pemasukan" : "pengeluaran";
    await sunting(ctx, `Jenis: ${draftLib.tampilNilai("jenis", s.draft.data.jenis)}`);
    await lanjutDraft(ctx);
  });

  aksi(/^dk:(\w+):(\w+)$/, async (ctx) => {
    const s = await draftAktif(ctx, ctx.match[1]);
    if (!s) return;
    const dr = s.draft;
    const f = s.ctx && s.ctx.field;
    if (ctx.match[2] === "baru") {
      return balas(ctx, "Ketik nama kategori barunya:", Markup.inlineKeyboard([[tombol("❌ Batal", `bt:${dr.id}`)]]));
    }
    const nama = (dr.opsiKategori || [])[Number(ctx.match[2])];
    if (!nama || !f) return toast(ctx, TEKS.tokenBasi);
    dr.data[f] = nama;
    await sunting(ctx, `Kategori: <b>${esc(nama)}</b>`);
    await lanjutDraft(ctx);
  });

  aksi(/^lw:(\w+):(\w+)$/, async (ctx) => {
    const s = await draftAktif(ctx, ctx.match[1]);
    if (!s) return;
    s.draft.diLewati.add(ctx.match[2]);
    await sunting(ctx, `${esc(draftLib.FIELD[ctx.match[2]]?.label || ctx.match[2])}: <i>dilewati</i>`);
    await lanjutDraft(ctx);
  });

  aksi(/^ub:(\w+)$/, async (ctx) => {
    const s = await draftAktif(ctx, ctx.match[1]);
    if (!s) return;
    const dr = s.draft;
    dr.id = idBaru();
    const field = draftLib.DEF[dr.aksi].ubah;
    const baris = [];
    for (let i = 0; i < field.length; i += 2) {
      baris.push(field.slice(i, i + 2).map((f) => tombol(draftLib.FIELD[f].label, `uf:${dr.id}:${f}`)));
    }
    baris.push([tombol("↩️ Kembali", `pv:${dr.id}`), tombol("❌ Batal", `bt:${dr.id}`)]);
    await sunting(ctx, "Mau ubah yang mana?", Markup.inlineKeyboard(baris));
  });

  aksi(/^pv:(\w+)$/, async (ctx) => {
    if (!(await draftAktif(ctx, ctx.match[1]))) return;
    await lanjutDraft(ctx);
  });

  aksi(/^uf:(\w+):(\w+)$/, async (ctx) => {
    const s = await draftAktif(ctx, ctx.match[1]);
    if (!s) return;
    const dr = s.draft;
    const field = ctx.match[2];
    if (!draftLib.DEF[dr.aksi].ubah.includes(field)) return toast(ctx, TEKS.tokenBasi);
    if (field === "jenis") {
      dr.data.jenis = dr.data.jenis === "pemasukan" ? "pengeluaran" : "pemasukan"; // toggle
      return lanjutDraft(ctx);
    }
    return tanyaField(ctx, dr, { field, opsional: false });
  });

  aksi(/^ok:(\w+)$/, async (ctx) => {
    const s = await draftAktif(ctx, ctx.match[1]);
    if (!s) return;
    const dr = s.draft;
    if (dr.menyimpan) return toast(ctx, "Sedang menyimpan…");
    dr.menyimpan = true; // cegah dobel-tap menyimpan dua kali

    try {
      const data = draftLib.dataSimpan(dr);
      let teks;
      let markup = {};

      if (dr.aksi === "tambah_keuangan") {
        const h = await keuanganSvc.catatKeuangan(data);
        teks = `Baik, sudah dicatat. ${fmt.tandaJenis(h.jenis)}\n\n${fmt.barisKeuangan(h)}`;
        markup = tombolItemKeuangan(h.id);
      } else if (dr.aksi === "tambah_barang") {
        const h = await barangSvc.tambahBarang(data);
        teks = `Baik, barang sudah ditambahkan. ✅\n\n${fmt.barisBarang(h)}`;
        markup = tombolItemBarang(h.id);
      } else if (dr.aksi === "edit_keuangan") {
        const h = await keuanganSvc.editKeuangan(data.id, data.perubahan);
        if (!h) throw new Error("Datanya tidak ditemukan (mungkin sudah dihapus)");
        teks = `Baik, sudah diperbarui. ✅\n\n${fmt.barisKeuangan(h)}`;
        markup = tombolItemKeuangan(h.id);
      } else {
        const h = await barangSvc.editBarang(data.id, data.perubahan);
        if (!h) throw new Error("Barangnya tidak ditemukan (mungkin sudah dihapus)");
        teks = `Baik, sudah diperbarui. ✅\n\n${fmt.barisBarang(h)}`;
        markup = tombolItemBarang(h.id);
      }

      sesi.bersihkanAlur(ctx.from.id);
      await sunting(ctx, teks, markup);
    } catch (err) {
      dr.menyimpan = false;
      log.error("[simpan] gagal:", err.stack || err.message);
      await balas(ctx, `Gagal menyimpan: ${esc(err.message)}\nKartunya masih bisa dicoba lagi.`);
    }
  });

  // ==================== EDIT / HAPUS / URUNGKAN (data yang sudah tersimpan) ====================
  const labelEdit = (f) => draftLib.FIELD[f].label;

  function menuEdit(prefiks, daftarField, id) {
    const baris = [];
    for (let i = 0; i < daftarField.length; i += 2) {
      baris.push(daftarField.slice(i, i + 2).map((f) => tombol(f === "jenis" ? "Jenis 🔁" : labelEdit(f), `${prefiks}:${f}:${id}`)));
    }
    baris.push([tombol("❌ Batal", "batal_aksi")]);
    return Markup.inlineKeyboard(baris);
  }

  aksi(/^ek:(.+)$/, (ctx) => balas(ctx, "Mau ubah apa?", menuEdit("fk", draftLib.FIELD_EDIT_KEUANGAN, ctx.match[1])));
  aksi(/^eb:(.+)$/, (ctx) => balas(ctx, "Mau ubah apa?", menuEdit("fb", draftLib.FIELD_EDIT_BARANG, ctx.match[1])));

  async function mulaiEdit(ctx, jenisItem, field, id) {
    const item = jenisItem === "keuangan" ? keuanganSvc.ambilKeuanganById(id) : barangSvc.ambilBarangById(id);
    if (!item) return balas(ctx, "Datanya tidak ditemukan (mungkin sudah dihapus).");
    const daftar = jenisItem === "keuangan" ? draftLib.FIELD_EDIT_KEUANGAN : draftLib.FIELD_EDIT_BARANG;
    if (!daftar.includes(field)) return toast(ctx, TEKS.tokenBasi);

    const data = {
      id,
      field,
      lama: item[field],
      judulItem: jenisItem === "keuangan" ? item.keterangan || item.kategori || "" : fmt.namaBarang(item),
    };
    if (field === "jenis") data.nilai = item.jenis === "pemasukan" ? "pengeluaran" : "pemasukan";
    return mulaiDraft(ctx, jenisItem === "keuangan" ? "edit_keuangan" : "edit_barang", data);
  }
  aksi(/^fk:(\w+):(.+)$/, (ctx) => mulaiEdit(ctx, "keuangan", ctx.match[1], ctx.match[2]));
  aksi(/^fb:(\w+):(.+)$/, (ctx) => mulaiEdit(ctx, "barang", ctx.match[1], ctx.match[2]));

  const tombolYaTidak = (ya) => Markup.inlineKeyboard([[tombol("✅ Ya, hapus", ya), tombol("❌ Batal", "batal_aksi")]]);

  aksi(/^hk:(.+)$/, async (ctx) => {
    const data = keuanganSvc.ambilKeuanganById(ctx.match[1]);
    if (!data) return balas(ctx, "Data tidak ditemukan (mungkin sudah dihapus).");
    return balas(ctx, `Yakin hapus catatan ini?\n\n${fmt.barisKeuangan(data)}`, tombolYaTidak(`yhk:${data.id}`));
  });
  aksi(/^hb:(.+)$/, async (ctx) => {
    const data = barangSvc.ambilBarangById(ctx.match[1]);
    if (!data) return balas(ctx, "Barang tidak ditemukan (mungkin sudah dihapus).");
    return balas(ctx, `Yakin hapus barang ini?\n\n${fmt.barisBarang(data)}`, tombolYaTidak(`yhb:${data.id}`));
  });
  aksi(/^yhk:(.+)$/, async (ctx) => {
    const h = await keuanganSvc.hapusKeuangan(ctx.match[1]);
    if (!h) return sunting(ctx, "Data tidak ditemukan.");
    await sunting(
      ctx,
      `🗑️ Terhapus: ${fmt.tandaJenis(h.jenis)} ${esc(formatRupiah(h.jumlah))} — ${esc(h.keterangan || h.kategori || "-")}\n<i>Masih tersimpan di arsip.</i>`,
      Markup.inlineKeyboard([[tombol("↩️ Urungkan", `urk:${h.id}`)]])
    );
  });
  aksi(/^yhb:(.+)$/, async (ctx) => {
    const h = await barangSvc.hapusBarang(ctx.match[1]);
    if (!h) return sunting(ctx, "Barang tidak ditemukan.");
    await sunting(ctx, `🗑️ Terhapus: <b>${esc(fmt.namaBarang(h))}</b>\n<i>Masih tersimpan di arsip.</i>`, Markup.inlineKeyboard([[tombol("↩️ Urungkan", `urb:${h.id}`)]]));
  });
  aksi(/^urk:(.+)$/, async (ctx) => {
    const h = await keuanganSvc.pulihkanKeuangan(ctx.match[1]);
    if (!h) return sunting(ctx, "Tidak bisa dikembalikan (sudah dikembalikan atau tidak ada di arsip).");
    await sunting(ctx, `↩️ Dikembalikan.\n\n${fmt.barisKeuangan(h)}`, tombolItemKeuangan(h.id));
  });
  aksi(/^urb:(.+)$/, async (ctx) => {
    const h = await barangSvc.pulihkanBarang(ctx.match[1]);
    if (!h) return sunting(ctx, "Tidak bisa dikembalikan (sudah dikembalikan atau tidak ada di arsip).");
    await sunting(ctx, `↩️ Dikembalikan.\n\n${fmt.barisBarang(h)}`, tombolItemBarang(h.id));
  });
  aksi("batal_aksi", async (ctx) => {
    sesi.bersihkanAlur(ctx.from.id); // termasuk langkah "menunggu ketikan" (cari barang, tanggal, dst)
    await sunting(ctx, "Baik, dibatalkan. 👍");
  });
  aksi("noop", async () => {});

  // ==================== LIST + PAGINASI ====================
  async function kirimDaftar(ctx, spek, { edit = false } = {}) {
    const s = stateDraft(ctx);
    spek.kid = sesi.simpanKueri(s, spek);
    const { teks, tombol: baris } = bangunHalaman(spek, 0);
    return edit ? sunting(ctx, teks, keyboard(baris)) : balas(ctx, teks, keyboard(baris));
  }

  aksi(/^hal:(\w+):(\d+)$/, async (ctx) => {
    const spek = stateDraft(ctx).kueri.get(ctx.match[1]);
    if (!spek || !spek.items) return toast(ctx, "List sudah kedaluwarsa, buka ulang ya");
    const { teks, tombol: baris } = bangunHalaman(spek, Number(ctx.match[2]));
    await sunting(ctx, teks, keyboard(baris));
  });

  const barisPeriode = (prefiks, aktif) => {
    const label = (p) => `${p === aktif ? "• " : ""}${PERIODE[p]}`;
    return [
      ["hari_ini", "minggu_ini", "bulan_ini"].map((p) => tombol(label(p), `${prefiks}:${p}`)),
      ["bulan_lalu", "semua"].map((p) => tombol(label(p), `${prefiks}:${p}`)),
    ];
  };

  // ---- barang ----
  async function tampilkanHasilBarang(ctx, hasil, judul = "📦 <b>Hasil pencarian</b>") {
    if (hasil.length === 0) return balas(ctx, "Barang tidak ditemukan di data HDB.");
    if (hasil.length === 1) return balas(ctx, fmt.detailBarang(hasil[0]), tombolItemBarang(hasil[0].id));
    return kirimDaftar(ctx, { judul, items: hasil, formatBaris: fmt.ringkasBarang, prefiksDetail: "bd" });
  }

  async function kirimStokRendah(ctx) {
    const daftar = barangSvc.stokRendah();
    if (daftar.length === 0) return balas(ctx, "Aman, tidak ada stok yang menipis. 👍");
    return kirimDaftar(ctx, { judul: "⚠️ <b>Stok Menipis</b>", items: daftar, formatBaris: fmt.ringkasBarang, prefiksDetail: "bd" });
  }

  async function kirimBarangByFilter(ctx, { kategori, merek }) {
    const daftar = barangSvc.barangByFilter({ kategori, merek });
    if (daftar.length === 0) return balas(ctx, "Tidak ada barang yang cocok.");
    const judul = [kategori, merek].filter(Boolean).join(" - ") || "Semua barang";
    return kirimDaftar(ctx, { judul: `📦 <b>${esc(judul)}</b>`, items: daftar, formatBaris: fmt.ringkasBarang, prefiksDetail: "bd" });
  }

  async function kirimDaftarKategori(ctx) {
    const daftar = barangSvc.daftarKategori();
    if (daftar.length === 0) return balas(ctx, "Belum ada barang tercatat.");
    const kid = sesi.simpanKueri(stateDraft(ctx), { items: daftar.map((k) => k.kategori) });
    const baris = daftar.map((k, i) => [tombol(`${k.kategori} (${k.jumlah})`, `pk:${kid}:${i}`)]);
    baris.push([tombol("« Kembali", "menu:barang")]);
    return balas(ctx, "📂 Pilih kategori:", Markup.inlineKeyboard(baris));
  }

  async function kirimDaftarMerek(ctx, kategori) {
    const daftar = barangSvc.daftarMerek(kategori);
    if (daftar.length === 0) return balas(ctx, kategori ? `Belum ada barang di kategori ${esc(kategori)}.` : "Belum ada barang tercatat.");
    const kid = sesi.simpanKueri(stateDraft(ctx), { kategori, items: daftar.map((m) => m.merek) });
    const baris = daftar.map((m, i) => [tombol(`${m.merek} (${m.jumlah})`, `pm:${kid}:${i}`)]);
    if (kategori) baris.push([tombol("📋 Lihat Semua di Kategori Ini", `ps:${kid}`)]);
    baris.push([tombol("« Kembali", "menu:barang")]);
    return balas(ctx, kategori ? `🏷️ Merek untuk kategori <b>${esc(kategori)}</b>:` : "🏷️ Pilih merek:", Markup.inlineKeyboard(baris));
  }

  aksi(/^pk:(\w+):(\d+)$/, async (ctx) => {
    const spek = stateDraft(ctx).kueri.get(ctx.match[1]);
    const kategori = spek && spek.items[Number(ctx.match[2])];
    if (!kategori) return toast(ctx, "List sudah kedaluwarsa, buka ulang ya");
    return kirimDaftarMerek(ctx, kategori);
  });
  aksi(/^pm:(\w+):(\d+)$/, async (ctx) => {
    const spek = stateDraft(ctx).kueri.get(ctx.match[1]);
    const merek = spek && spek.items[Number(ctx.match[2])];
    if (!merek) return toast(ctx, "List sudah kedaluwarsa, buka ulang ya");
    return kirimBarangByFilter(ctx, { kategori: spek.kategori || null, merek });
  });
  aksi(/^ps:(\w+)$/, async (ctx) => {
    const spek = stateDraft(ctx).kueri.get(ctx.match[1]);
    if (!spek) return toast(ctx, "List sudah kedaluwarsa, buka ulang ya");
    return kirimBarangByFilter(ctx, { kategori: spek.kategori || null, merek: null });
  });

  aksi(/^bd:(.+)$/, async (ctx) => {
    const b = barangSvc.ambilBarangById(ctx.match[1]);
    if (!b) return balas(ctx, "Barang tidak ditemukan (mungkin sudah dihapus).");
    return balas(ctx, fmt.detailBarang(b), tombolItemBarang(b.id));
  });

  // ---- keuangan ----
  const KODE_JENIS = { m: "pemasukan", k: "pengeluaran", s: null };
  const kodeDariJenis = (jenis) => (jenis === "pemasukan" ? "m" : jenis === "pengeluaran" ? "k" : "s");

  async function kirimListKeuangan(ctx, { jenis = null, periode = "semua" } = {}, { edit = false } = {}) {
    const items = keuanganSvc.riwayatKeuangan({ jenis, periode });
    const judul = jenis === "pemasukan" ? "🟢 <b>Pemasukan</b>" : jenis === "pengeluaran" ? "🔴 <b>Pengeluaran</b>" : "💰 <b>Catatan Keuangan</b>";
    return kirimDaftar(
      ctx,
      {
        judul: `${judul} — ${esc(PERIODE[periode])}`,
        items,
        formatBaris: fmt.ringkasKeuangan,
        prefiksDetail: "kd",
        pesanKosong: "Belum ada catatan di periode ini.",
        bawah: barisPeriode(`lp:${kodeDariJenis(jenis)}`, periode),
      },
      { edit }
    );
  }
  aksi(/^lp:([mks]):(\w+)$/, async (ctx) => {
    if (!periodeValid(ctx.match[2])) return toast(ctx, TEKS.tokenBasi);
    return kirimListKeuangan(ctx, { jenis: KODE_JENIS[ctx.match[1]], periode: ctx.match[2] }, { edit: true });
  });

  async function kirimRekap(ctx, periode = "bulan_ini", { edit = false } = {}) {
    const r = keuanganSvc.rekapKeuangan({ periode });
    const teks =
      r.jumlahTransaksi === 0
        ? `💰 <b>Rekap — ${esc(PERIODE[periode])}</b>\n\nBelum ada catatan keuangan di periode ini.`
        : fmt.teksRekap(r);
    const extra = Markup.inlineKeyboard(barisPeriode("rk", periode));
    return edit ? sunting(ctx, teks, extra) : balas(ctx, teks, extra);
  }
  aksi(/^rk:(\w+)$/, async (ctx) => {
    if (!periodeValid(ctx.match[1])) return toast(ctx, TEKS.tokenBasi);
    return kirimRekap(ctx, ctx.match[1], { edit: true });
  });

  aksi(/^kd:(.+)$/, async (ctx) => {
    const k = keuanganSvc.ambilKeuanganById(ctx.match[1]);
    if (!k) return balas(ctx, "Catatan tidak ditemukan (mungkin sudah dihapus).");
    return balas(ctx, fmt.barisKeuangan(k), tombolItemKeuangan(k.id));
  });

  // ---- transaksi ----
  async function tampilkanDaftarTransaksi(ctx, daftar, judul = "🧾 <b>Transaksi</b>") {
    if (!daftar || daftar.length === 0) return balas(ctx, "Transaksi tidak ditemukan di data HDB.");
    if (daftar.length === 1) return balas(ctx, fmt.teksInvoice(daftar[0]));
    return kirimDaftar(ctx, { judul, items: daftar, formatBaris: fmt.ringkasTransaksi, prefiksDetail: "td" });
  }
  aksi(/^td:(.+)$/, async (ctx) => {
    const t = transaksiSvc.ambilInvoiceById(ctx.match[1]);
    if (!t) return balas(ctx, "Transaksi tidak ditemukan.");
    return balas(ctx, fmt.teksInvoice(t));
  });

  async function tanyaTanggal(ctx) {
    const s = sesi.bersihkanAlur(ctx.from.id);
    s.langkah = "tanggal_transaksi";
    const sekarang = dayjs();
    const tgl = (n) => sekarang.subtract(n, "day").format("YYYY-MM-DD");
    return balas(
      ctx,
      "Transaksi tanggal berapa? Ketuk pilihan, atau ketik (contoh: <b>kemarin</b>, <b>12/11</b>, <b>2026-11-12</b>):",
      Markup.inlineKeyboard([[tombol("Hari ini", `tg:${tgl(0)}`), tombol("Kemarin", `tg:${tgl(1)}`), tombol("2 hari lalu", `tg:${tgl(2)}`)]])
    );
  }
  async function transaksiPadaTanggal(ctx, tanggal) {
    sesi.bersihkanAlur(ctx.from.id);
    const daftar = transaksiSvc.transaksiByTanggal(tanggal);
    if (daftar.length === 0) return balas(ctx, `Tidak ada transaksi pada ${esc(tanggal)}.`);
    return tampilkanDaftarTransaksi(ctx, daftar, `🧾 <b>Transaksi ${esc(tanggal)}</b>`);
  }
  aksi(/^tg:(\d{4}-\d{2}-\d{2})$/, (ctx) => transaksiPadaTanggal(ctx, ctx.match[1]));

  // ==================== NAVIGASI MENU & AKSI LANGSUNG ====================
  const menuNav = (nama, teks, menu) =>
    aksi(`menu:${nama}`, async (ctx) => {
      sesi.bersihkanAlur(ctx.from.id);
      await sunting(ctx, teks, menu());
    });
  menuNav("utama", "Menu utama:", menuUtama);
  menuNav("keuangan", "💰 <b>Menu Keuangan</b>", menuKeuangan);
  menuNav("barang", "📦 <b>Menu Barang</b>", menuBarang);
  menuNav("transaksi", "🧾 <b>Menu Transaksi</b>", menuTransaksi);

  const aksiLangsung = (nama, fn) =>
    aksi(`aksi:${nama}`, async (ctx) => {
      sesi.bersihkanAlur(ctx.from.id);
      await fn(ctx);
    });
  aksiLangsung("rekap", (ctx) => kirimRekap(ctx, "bulan_ini"));
  aksiLangsung("grafik", (ctx) => kirimRekap(ctx, "bulan_ini"));
  aksiLangsung("list_masuk", (ctx) => kirimListKeuangan(ctx, { jenis: "pemasukan" }));
  aksiLangsung("list_keluar", (ctx) => kirimListKeuangan(ctx, { jenis: "pengeluaran" }));
  aksiLangsung("stok_rendah", kirimStokRendah);
  aksiLangsung("transaksi_terbaru", (ctx) => tampilkanDaftarTransaksi(ctx, transaksiSvc.transaksiTerbaru(40), "🧾 <b>Transaksi Terbaru</b>"));
  aksiLangsung("browse_kategori", kirimDaftarKategori);
  aksiLangsung("browse_merek", (ctx) => kirimDaftarMerek(ctx, null));

  const tanyaTeks = async (ctx, langkah, pertanyaan) => {
    const s = sesi.bersihkanAlur(ctx.from.id);
    s.langkah = langkah;
    return balas(ctx, pertanyaan, Markup.inlineKeyboard([[tombol("❌ Batal", "batal_aksi")]]));
  };
  aksi("input:masuk", (ctx) => mulaiDraft(ctx, "tambah_keuangan", { jenis: "pemasukan" }));
  aksi("input:keluar", (ctx) => mulaiDraft(ctx, "tambah_keuangan", { jenis: "pengeluaran" }));
  aksi("input:tambah_barang", (ctx) => mulaiDraft(ctx, "tambah_barang", {}));
  aksi("input:cari_barang", (ctx) => tanyaTeks(ctx, "cari_barang", "Ketik nama barang yang ingin dicari:"));
  aksi("input:cari_transaksi", (ctx) => tanyaTeks(ctx, "cari_transaksi", "Ketik nama pelanggan, nomor nota, atau nama barang:"));
  aksi("input:tanggal_transaksi", tanyaTanggal);

  // ==================== COMMAND ====================
  bot.start(async (ctx) => {
    sesi.reset(ctx.from.id);
    await kirimMenu(ctx);
  });
  bot.command("menu", (ctx) => balas(ctx, "Menu utama:", menuUtama()));
  bot.command("myid", (ctx) => balas(ctx, `ID Telegram Anda: <code>${esc(ctx.from.id)}</code>`));
  bot.command("batal", async (ctx) => {
    sesi.reset(ctx.from.id);
    await balas(ctx, "Baik, dibatalkan. 👍", menuUtama());
  });

  const argumen = (ctx) => ctx.message.text.split(/\s+/).slice(1).join(" ").trim();

  bot.command("transaksi", async (ctx) => {
    const kata = argumen(ctx);
    if (!kata) return tanyaTeks(ctx, "cari_transaksi", "Ketik nama pelanggan, nomor nota, atau nama barang:");
    return tampilkanDaftarTransaksi(ctx, transaksiSvc.cariTransaksi(kata));
  });
  bot.command("invoice", async (ctx) => {
    const nota = argumen(ctx);
    if (!nota) return tanyaTeks(ctx, "nota_invoice", "Ketik nomor nota:");
    return kirimInvoice(ctx, nota);
  });
  bot.command("tanggal", async (ctx) => {
    const tgl = argumen(ctx);
    if (!tgl) return tanyaTanggal(ctx);
    const valid = parseTanggal(tgl);
    if (!valid) return tanyaTanggal(ctx);
    return transaksiPadaTanggal(ctx, valid);
  });
  bot.command("kategori", (ctx) => kirimDaftarKategori(ctx));
  bot.command("merek", (ctx) => kirimDaftarMerek(ctx, null));

  async function kirimInvoice(ctx, nota) {
    const t = transaksiSvc.ambilInvoice(nota);
    return t ? balas(ctx, fmt.teksInvoice(t)) : balas(ctx, "Nota tidak ditemukan di data HDB.");
  }

  // ==================== ROUTER LANGKAH (menggantikan if-chain "menunggu") ====================
  const LANGKAH = {
    isi_draft: (ctx, s, teks) => jawabDraft(ctx, s, teks),
    cari_barang: (ctx, s, teks) => {
      sesi.bersihkanAlur(ctx.from.id);
      return tampilkanHasilBarang(ctx, barangSvc.cariBarang(teks));
    },
    cari_transaksi: (ctx, s, teks) => {
      sesi.bersihkanAlur(ctx.from.id);
      return tampilkanDaftarTransaksi(ctx, transaksiSvc.cariTransaksi(teks));
    },
    nota_invoice: (ctx, s, teks) => {
      sesi.bersihkanAlur(ctx.from.id);
      return kirimInvoice(ctx, teks);
    },
    tanggal_transaksi: (ctx, s, teks) => {
      const tgl = parseTanggal(teks);
      if (!tgl) return balas(ctx, "Tanggal belum kebaca. Contoh: <b>kemarin</b>, <b>12/11</b>, atau <b>2026-11-12</b>. Atau ketuk ❌ Batal.", Markup.inlineKeyboard([[tombol("❌ Batal", "batal_aksi")]]));
      return transaksiPadaTanggal(ctx, tgl);
    },
  };

  // ==================== PESAN BEBAS (NLU) ====================
  async function pesanBebas(ctx, teks) {
    await ctx.sendChatAction("typing").catch(() => {});
    const { aksi: niat, data } = await nlu.parsePesan(teks);

    switch (niat) {
      case "tambah_keuangan":
        return mulaiDraft(ctx, "tambah_keuangan", data);
      case "tambah_barang":
        return mulaiDraft(ctx, "tambah_barang", data);
      case "rekap_keuangan":
        return kirimRekap(ctx, data.periode || "bulan_ini");
      case "riwayat_keuangan":
        return kirimListKeuangan(ctx, { jenis: data.jenis || null, periode: data.periode || "semua" });
      case "cari_barang":
        if (!data.kataKunci) return tanyaTeks(ctx, "cari_barang", "Mau cari barang apa? Ketik namanya:");
        return tampilkanHasilBarang(ctx, barangSvc.cariBarang(data.kataKunci));
      case "daftar_kategori":
        return kirimDaftarKategori(ctx);
      case "daftar_merek":
        return kirimDaftarMerek(ctx, data.kategori || null);
      case "stok_rendah":
        return kirimStokRendah(ctx);
      case "cari_transaksi":
        if (!data.kataKunci) return tanyaTeks(ctx, "cari_transaksi", "Cari transaksi siapa/apa? Ketik nama pelanggan, nota, atau barang:");
        return tampilkanDaftarTransaksi(ctx, transaksiSvc.cariTransaksi(data.kataKunci));
      case "transaksi_terbaru":
        return tampilkanDaftarTransaksi(ctx, transaksiSvc.transaksiTerbaru(40), "🧾 <b>Transaksi Terbaru</b>");
      case "transaksi_tanggal": {
        const tgl = parseTanggal(data.tanggal);
        return tgl ? transaksiPadaTanggal(ctx, tgl) : tanyaTanggal(ctx);
      }
      case "sapa":
        return kirimMenu(ctx, TEKS.sapa);
      case "di_luar_hdb":
        return kirimMenu(ctx, TEKS.diLuar);
      case "layanan_terbatas":
        return kirimMenu(ctx, TEKS.terbatas);
      default:
        return balas(
          ctx,
          TEKS.tidakJelas,
          Markup.inlineKeyboard([
            [tombol("🔍 Cari barang", "input:cari_barang"), tombol("💰 Catat uang", "menu:keuangan")],
            [tombol("🧾 Cek transaksi", "menu:transaksi"), tombol("📋 Menu", "menu:utama")],
          ])
        );
    }
  }

  bot.on("text", async (ctx) => {
    const teks = ctx.message.text;
    if (teks.startsWith("/")) return balas(ctx, "Perintah itu belum ada. Coba /menu.");

    const s = sesi.ambil(ctx.from.id);
    if (s.langkah && LANGKAH[s.langkah]) return LANGKAH[s.langkah](ctx, s, teks);
    return pesanBebas(ctx, teks);
  });

  // ==================== ERROR ====================
  bot.catch(async (err, ctx) => {
    log.error("[bot] error:", (err && err.stack) || err);
    try {
      if (ctx.callbackQuery) await ctx.answerCbQuery("Ada gangguan, coba lagi ya").catch(() => {});
      await ctx.reply("Maaf, sedang ada gangguan. Coba lagi sebentar ya. 🙏");
    } catch {
      /* diam: jangan sampai handler error bikin loop error */
    }
  });

  return bot;
}

module.exports = { buatBot, TEKS };
