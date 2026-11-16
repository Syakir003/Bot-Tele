// Semua urusan tanggal/waktu bot ini pakai WIB, apapun timezone server-nya.
process.env.TZ = "Asia/Jakarta";

const dayjs = require("dayjs");

const FORMAT_TANGGAL = "YYYY-MM-DD";

function sekarang() {
  return dayjs();
}

function hariIni(acuan = dayjs()) {
  return acuan.format(FORMAT_TANGGAL);
}

// Cek tanggal kalender valid (31 Feb dll ditolak), balikin "YYYY-MM-DD" atau null
function susunTanggal(tahun, bulan, hari) {
  const t = Number(tahun);
  const b = Number(bulan);
  const h = Number(hari);
  if (!Number.isInteger(t) || !Number.isInteger(b) || !Number.isInteger(h)) return null;
  if (t < 2000 || t > 2100 || b < 1 || b > 12 || h < 1 || h > 31) return null;
  const d = dayjs(new Date(t, b - 1, h));
  if (d.year() !== t || d.month() !== b - 1 || d.date() !== h) return null;
  return d.format(FORMAT_TANGGAL);
}

// "kemarin", "2 hari lalu", "12/11", "12-11-2026", "2026-11-12" -> "YYYY-MM-DD" | null
function parseTanggal(teks, acuan = dayjs()) {
  const t = String(teks || "").trim().toLowerCase();
  if (!t) return null;

  if (t === "hari ini" || t === "hariini" || t === "today") return hariIni(acuan);
  if (t === "kemarin") return hariIni(acuan.subtract(1, "day"));
  if (t === "kemarin lusa" || t === "lusa kemarin") return hariIni(acuan.subtract(2, "day"));

  let m = t.match(/^(\d{1,2})\s*hari\s*(?:yang\s*)?lalu$/);
  if (m) {
    const n = Number(m[1]);
    return n >= 0 && n <= 365 ? hariIni(acuan.subtract(n, "day")) : null;
  }

  m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/); // YYYY-MM-DD
  if (m) return susunTanggal(m[1], m[2], m[3]);

  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // DD-MM-YYYY
  if (m) return susunTanggal(m[3], m[2], m[1]);

  m = t.match(/^(\d{1,2})[-/.](\d{1,2})$/); // DD/MM (tahun ini)
  if (m) return susunTanggal(acuan.year(), m[2], m[1]);

  return null;
}

const PERIODE = {
  hari_ini: "Hari ini",
  minggu_ini: "Minggu ini",
  bulan_ini: "Bulan ini",
  bulan_lalu: "Bulan lalu",
  semua: "Semua",
};

function periodeValid(p) {
  return Object.prototype.hasOwnProperty.call(PERIODE, p);
}

// Rentang tanggal inklusif {dari, sampai} (string YYYY-MM-DD). "semua" -> null.
// Minggu dimulai hari Senin.
function rentangPeriode(periode, acuan = dayjs()) {
  switch (periode) {
    case "hari_ini":
      return { dari: hariIni(acuan), sampai: hariIni(acuan) };
    case "minggu_ini": {
      const mundur = (acuan.day() + 6) % 7; // Senin=0 ... Minggu=6
      const awal = acuan.subtract(mundur, "day");
      return { dari: hariIni(awal), sampai: hariIni(awal.add(6, "day")) };
    }
    case "bulan_ini":
      return { dari: hariIni(acuan.startOf("month")), sampai: hariIni(acuan.endOf("month")) };
    case "bulan_lalu": {
      const lalu = acuan.startOf("month").subtract(1, "month");
      return { dari: hariIni(lalu.startOf("month")), sampai: hariIni(lalu.endOf("month")) };
    }
    case "semua":
      return null;
    default:
      throw new Error(`Periode tidak dikenal: ${periode}`);
  }
}

function labelPeriode(periode) {
  return PERIODE[periode] || PERIODE.bulan_ini;
}

// ms epoch -> "YYYY-MM-DD" (WIB)
function tanggalDariMs(ms) {
  return dayjs(ms).format(FORMAT_TANGGAL);
}

module.exports = {
  FORMAT_TANGGAL,
  PERIODE,
  sekarang,
  hariIni,
  parseTanggal,
  periodeValid,
  rentangPeriode,
  labelPeriode,
  tanggalDariMs,
};
