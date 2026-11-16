// Firebase Realtime Database palsu (in-memory) yang cukup mirip buat tes cache & service:
// ref(path).on("child_added|child_changed|child_removed"), once("value"), set, update, remove, push.
// Event child_* dikirim sinkron saat tulis (seperti event lokal SDK) dan async saat attach (seperti initial load).

function salin(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}

function buatFakeDb(awal = {}) {
  const data = salin(awal);
  const pendengar = []; // { node, jenis, cb, cancel }
  let counter = 0;
  const log = { tulis: [] };

  const pecah = (path) => path.split("/").filter(Boolean);
  const ambil = (path) => pecah(path).reduce((o, k) => (o == null ? undefined : o[k]), data);

  function tulis(path, nilai) {
    const bagian = pecah(path);
    const kunci = bagian.pop();
    let induk = data;
    for (const b of bagian) {
      if (induk[b] == null || typeof induk[b] !== "object") induk[b] = {};
      induk = induk[b];
    }
    if (nilai === null || nilai === undefined) delete induk[kunci];
    else induk[kunci] = salin(nilai);
  }

  function snap(key, val) {
    return { key, val: () => (val === undefined ? null : salin(val)) };
  }

  function picu(node, jenis, key, val) {
    for (const p of pendengar) {
      if (p.node === node && p.jenis === jenis) p.cb(snap(key, val));
    }
  }

  // path "node/id" atau "node": emit child_* ke pendengar di "node"
  function setNilai(path, nilai) {
    log.tulis.push({ path, nilai: salin(nilai) });
    const bagian = pecah(path);
    if (bagian.length === 2) {
      const [node, id] = bagian;
      const ada = ambil(path) !== undefined;
      tulis(path, nilai);
      if (nilai === null || nilai === undefined) {
        if (ada) picu(node, "child_removed", id, undefined);
      } else {
        picu(node, ada ? "child_changed" : "child_added", id, ambil(path));
      }
      return;
    }
    tulis(path, nilai);
  }

  function ref(path) {
    return {
      key: pecah(path).pop(),
      on(jenis, cb, cancel) {
        const node = pecah(path)[0];
        pendengar.push({ node, jenis, cb, cancel });
        if (jenis === "child_added") {
          const sekarang = ambil(path) || {};
          // initial load: async, sebelum "value" milik once() yang dipanggil sesudahnya
          Promise.resolve().then(() => {
            for (const [id, val] of Object.entries(sekarang)) cb(snap(id, val));
          });
        }
      },
      once(jenis) {
        if (jenis !== "value") throw new Error("fakeDb: cuma 'value'");
        // tunda sedikit supaya child_added awal sudah jalan duluan
        return new Promise((res) => setTimeout(() => res(snap(pecah(path).pop(), ambil(path))), 5));
      },
      async set(nilai) {
        setNilai(path, nilai);
      },
      async update(parsial) {
        const lama = ambil(path) || {};
        setNilai(path, { ...lama, ...parsial });
      },
      async remove() {
        setNilai(path, null);
      },
      push() {
        counter += 1;
        const id = `-id${String(counter).padStart(6, "0")}`;
        return ref(`${path}/${id}`);
      },
    };
  }

  return {
    ref,
    _data: data,
    _log: log,
    // tulis dari "luar" (misal app HDB lain), memicu event seperti biasa
    tulisLuar: (path, nilai) => setNilai(path, nilai),
    // simulasi listener ditolak Firebase
    gagalkan(err = new Error("permission_denied")) {
      for (const p of pendengar) if (p.cancel) p.cancel(err);
    },
  };
}

module.exports = { buatFakeDb };
