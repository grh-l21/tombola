// QR-Code-Erzeugung ohne Internet und ohne fremde Bibliothek.
// Byte-Modus, Fehlerkorrektur M, Versionen 1–9 (bis 180 Zeichen) – reicht für den Los-Link.
(function (root) {
  // Pro Version: Korrekturwörter je Block und die Blöcke als [Anzahl, Datenwörter].
  const BLOECKE = [null,
    [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
    [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]]];
  const AUSRICHTUNG = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46]];

  // Rechnen im Galois-Feld GF(256), Polynom 0x11D
  const EXP = new Uint8Array(510);
  const LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = EXP[i + 255] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  const mal = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function korrektur(daten, n) {
    let gen = [1];
    for (let i = 0; i < n; i++) {
      const neu = new Array(gen.length + 1).fill(0);
      for (let j = 0; j < gen.length; j++) {
        neu[j] ^= gen[j];
        neu[j + 1] ^= mal(gen[j], EXP[i]);
      }
      gen = neu;
    }
    const rest = new Array(n).fill(0);
    for (const b of daten) {
      const f = b ^ rest.shift();
      rest.push(0);
      for (let j = 0; j < n; j++) rest[j] ^= mal(gen[j + 1], f);
    }
    return rest;
  }

  const datenWoerter = (v) => BLOECKE[v][1].reduce((s, [anz, len]) => s + anz * len, 0);

  function codewoerter(bytes, v) {
    const platz = datenWoerter(v);
    const bits = [];
    const push = (wert, laenge) => { for (let i = laenge - 1; i >= 0; i--) bits.push((wert >>> i) & 1); };
    push(4, 4);                 // Byte-Modus
    push(bytes.length, 8);
    bytes.forEach((b) => push(b, 8));
    push(0, Math.min(4, platz * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const daten = [];
    for (let i = 0; i < bits.length; i += 8) {
      daten.push(bits.slice(i, i + 8).reduce((s, b) => (s << 1) | b, 0));
    }
    for (let fuell = 0xEC; daten.length < platz; fuell ^= 0xEC ^ 0x11) daten.push(fuell);

    const [ecLen, gruppen] = BLOECKE[v];
    const bloecke = [];
    let pos = 0;
    gruppen.forEach(([anz, len]) => {
      for (let i = 0; i < anz; i++) {
        const d = daten.slice(pos, pos + len);
        pos += len;
        bloecke.push({ d, e: korrektur(d, ecLen) });
      }
    });
    const aus = [];
    const maxLen = Math.max(...bloecke.map((b) => b.d.length));
    for (let i = 0; i < maxLen; i++) bloecke.forEach((b) => { if (i < b.d.length) aus.push(b.d[i]); });
    for (let i = 0; i < ecLen; i++) bloecke.forEach((b) => aus.push(b.e[i]));
    return aus;
  }

  const MASKEN = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
    (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
  ];

  function geruest(v) {
    const n = 17 + 4 * v;
    const m = Array.from({ length: n }, () => new Uint8Array(n));
    const fest = Array.from({ length: n }, () => new Uint8Array(n));
    const setze = (x, y, dunkel) => {
      if (x < 0 || y < 0 || x >= n || y >= n) return;
      m[y][x] = dunkel ? 1 : 0;
      fest[y][x] = 1;
    };
    // Suchmuster in drei Ecken, samt hellem Rand
    [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([ox, oy]) => {
      for (let dy = -1; dy <= 7; dy++) {
        for (let dx = -1; dx <= 7; dx++) {
          const innen = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
          const rand = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          const kern = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          setze(ox + dx, oy + dy, innen && (rand || kern));
        }
      }
    });
    // Taktlinien
    for (let i = 8; i < n - 8; i++) {
      setze(i, 6, i % 2 === 0);
      setze(6, i, i % 2 === 0);
    }
    // Ausrichtungsmuster
    const pos = AUSRICHTUNG[v];
    const letzte = pos.length - 1;
    pos.forEach((cy, i) => pos.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === letzte) || (i === letzte && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) setze(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }));
    // Platz für Format- und Versionsangaben freihalten
    for (let i = 0; i < 9; i++) { setze(i, 8, m[8][i]); setze(8, i, m[i][8]); }
    for (let i = 0; i < 8; i++) { setze(n - 1 - i, 8, 0); setze(8, n - 1 - i, 0); }
    setze(8, n - 8, 1);
    if (v >= 7) {
      let rest = v;
      for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1F25);
      const bits = (v << 12) | rest;
      for (let i = 0; i < 18; i++) {
        const b = (bits >>> i) & 1;
        const a = n - 11 + (i % 3);
        const c = Math.floor(i / 3);
        setze(a, c, b);
        setze(c, a, b);
      }
    }
    return { n, m, fest, setze };
  }

  function formatSchreiben(g, maske) {
    const n = g.n;
    const daten = maske;        // Fehlerkorrektur M = Bits 00
    let rest = daten;
    for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
    const bits = ((daten << 10) | rest) ^ 0x5412;
    const bit = (i) => (bits >>> i) & 1;
    for (let i = 0; i <= 5; i++) g.setze(8, i, bit(i));
    g.setze(8, 7, bit(6));
    g.setze(8, 8, bit(7));
    g.setze(7, 8, bit(8));
    for (let i = 9; i < 15; i++) g.setze(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) g.setze(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) g.setze(8, n - 15 + i, bit(i));
    g.setze(8, n - 8, 1);
  }

  function datenLegen(g, woerter) {
    const n = g.n;
    let i = 0;
    for (let rechts = n - 1; rechts >= 1; rechts -= 2) {
      if (rechts === 6) rechts = 5;
      for (let schritt = 0; schritt < n; schritt++) {
        for (let j = 0; j < 2; j++) {
          const x = rechts - j;
          const hinauf = ((rechts + 1) & 2) === 0;
          const y = hinauf ? n - 1 - schritt : schritt;
          if (g.fest[y][x]) continue;
          g.m[y][x] = i < woerter.length * 8 ? (woerter[i >>> 3] >>> (7 - (i & 7))) & 1 : 0;
          i++;
        }
      }
    }
  }

  function maskieren(g, maske) {
    const f = MASKEN[maske];
    for (let y = 0; y < g.n; y++) {
      for (let x = 0; x < g.n; x++) if (!g.fest[y][x] && f(x, y)) g.m[y][x] ^= 1;
    }
  }

  // Strafpunkte nach der Norm: je weniger, desto besser lesbar.
  function strafe(g) {
    const n = g.n;
    const m = g.m;
    let p = 0;
    const linie = (hole) => {
      let lauf = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && hole(i) === hole(i - 1)) { lauf++; continue; }
        if (lauf >= 5) p += lauf - 2;
        lauf = 1;
      }
      const muster = [[1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]];
      for (let i = 0; i + 11 <= n; i++) {
        muster.forEach((mu) => { if (mu.every((b, k) => hole(i + k) === b)) p += 40; });
      }
    };
    for (let a = 0; a < n; a++) {
      linie((i) => m[a][i]);
      linie((i) => m[i][a]);
    }
    let dunkel = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        dunkel += m[y][x];
        if (x < n - 1 && y < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
      }
    }
    p += Math.floor(Math.abs(dunkel * 20 - n * n * 10) / (n * n)) * 10;
    return p;
  }

  // Gibt { n, m } zurück: Kantenlänge und Zeilen mit 1 = dunkel.
  function matrix(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let v = 1;
    while (v <= 9 && datenWoerter(v) - 2 < bytes.length) v++;
    if (v > 9) throw new Error('Text ist zu lang für den QR-Code.');
    const woerter = codewoerter(bytes, v);
    let beste = null;
    for (let maske = 0; maske < 8; maske++) {
      const g = geruest(v);
      datenLegen(g, woerter);
      maskieren(g, maske);
      formatSchreiben(g, maske);
      const s = strafe(g);
      if (!beste || s < beste.s) beste = { s, g };
    }
    return { n: beste.g.n, m: beste.g.m };
  }

  // SVG mit vier Modulen hellem Rand, füllt den umgebenden Kasten.
  function svg(text) {
    const { n, m } = matrix(text);
    const rand = 4;
    let pfad = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!m[y][x]) continue;
        let w = 1;
        while (x + w < n && m[y][x + w]) w++;
        pfad += 'M' + (x + rand) + ' ' + (y + rand) + 'h' + w + 'v1h-' + w + 'z';
        x += w - 1;
      }
    }
    const g = n + 2 * rand;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + g + ' ' + g + '" shape-rendering="crispEdges" role="img" aria-label="QR-Code">' +
      '<rect width="' + g + '" height="' + g + '" fill="#fff"/><path d="' + pfad + '" fill="#000"/></svg>';
  }

  const api = { matrix, svg };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QR = api;
})(typeof self !== 'undefined' ? self : this);
