const test = require("node:test");
const assert = require("node:assert/strict");
const { parseJumlah, esc, formatRupiah } = require("../src/services/util");

test("parseJumlah: format nominal umum", () => {
  const kasus = [
    ["20rb", 20000],
    ["20 rb", 20000],
    ["1.5jt", 1500000],
    ["1,5jt", 1500000],
    ["2,5 juta", 2500000],
    ["50k", 50000],
    ["500 ribu", 500000],
    ["350000", 350000],
    ["1.500.000", 1500000], // bug lama: kebaca 1.5
    ["Rp 350.000", 350000],
    ["Rp350.000", 350000],
    ["1,500,000", 1500000],
    ["12.000", 12000],
    [450000, 450000],
    ["0", 0],
    ["", 0],
    [null, 0],
    [undefined, 0],
    ["abc", 0],
    ["350rb servis", 0], // bukan nominal murni -> tolak, jangan nebak
    ["-5rb", 0],
    ["1.2.3", 0],
  ];
  for (const [masuk, harapan] of kasus) {
    assert.equal(parseJumlah(masuk), harapan, `parseJumlah(${JSON.stringify(masuk)})`);
  }
});

test("parseJumlah: angka non-finite ditolak", () => {
  assert.equal(parseJumlah(NaN), 0);
  assert.equal(parseJumlah(Infinity), 0);
});

test("esc: karakter HTML di-escape", () => {
  assert.equal(esc("Freon R32_A *tebal* [x]"), "Freon R32_A *tebal* [x]"); // markdown aman di HTML mode
  assert.equal(esc("<b>&</b>"), "&lt;b&gt;&amp;&lt;/b&gt;");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(123), "123");
});

test("formatRupiah", () => {
  assert.equal(formatRupiah(1500000), "Rp 1.500.000");
  assert.equal(formatRupiah(null), "Rp 0");
});
