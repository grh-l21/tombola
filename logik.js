// Los-Logik ohne Bildschirm: auslosen, Link bauen und lesen, ziehen, sichern.
// Läuft im Browser (window.Tombola) und in den Tests (require).
(function (root) {
  const NIETE = 'N';
  const GLUEHWEIN = 'G';
  const BIER = 'B';          // ein Schnaitl, 0,3 l
  // Ohne I, O, 0 und 1 – die verwechselt man beim Vorlesen.
  const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE_LAENGE = 4;

  const STANDARD_CONFIG = {
    preis: 10,
    quoteGluehwein: 30,   // Prozent aller Lose
    quoteBier: 10,        // Prozent aller Lose
    quoteTopf: 40,        // Prozent aller Lose; der Rest sind Nieten
    gewichte: {},         // Topf-id -> Gewicht, fehlend = 1
    losSeite: '',         // Adresse der Los-Seite; leer = neben der Stand-App
    abholfrist: ''
  };

  const zahl = (v, def, min, max) => {
    const n = Number(v);
    if (!isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  };

  function configPruefen(c, preise) {
    const d = STANDARD_CONFIG;
    c = c && typeof c === 'object' ? c : {};
    const g = zahl(c.quoteGluehwein, d.quoteGluehwein, 0, 100);
    const b = zahl(c.quoteBier, d.quoteBier, 0, 100 - g);
    const t = zahl(c.quoteTopf, d.quoteTopf, 0, 100 - g - b);
    const gewichte = {};
    preise.forEach((p) => {
      gewichte[p.id] = zahl(c.gewichte && c.gewichte[p.id], 1, 0, 1000);
    });
    return {
      preis: zahl(c.preis, d.preis, 0, 100000),
      quoteGluehwein: g,
      quoteBier: b,
      quoteTopf: t,
      gewichte,
      losSeite: String(c.losSeite || '').trim(),
      abholfrist: String(c.abholfrist || '').trim()
    };
  }

  function leererStand() {
    return { lose: [], ziehung: {}, verfallen: {}, letzteSicherung: 0 };
  }

  function standPruefen(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.lose)) return leererStand();
    return {
      lose: s.lose,
      ziehung: s.ziehung && typeof s.ziehung === 'object' ? s.ziehung : {},
      verfallen: s.verfallen && typeof s.verfallen === 'object' ? s.verfallen : {},
      letzteSicherung: Number(s.letzteSicherung) || 0
    };
  }

  // Ergebnis eines Loses: Niete, Glühwein, Schnaitl oder die id eines Topfes.
  // rand01 liefert Zufallszahlen in [0, 1).
  function auslosen(config, preise, rand01) {
    const r = rand01() * 100;
    const getraenke = config.quoteGluehwein + config.quoteBier;
    if (r < config.quoteGluehwein) return GLUEHWEIN;
    if (r < getraenke) return BIER;
    if (r >= getraenke + config.quoteTopf) return NIETE;
    const aktiv = preise.filter((p) => config.gewichte[p.id] > 0);
    const summe = aktiv.reduce((s, p) => s + config.gewichte[p.id], 0);
    if (!summe) return NIETE;
    let x = rand01() * summe;
    for (const p of aktiv) {
      x -= config.gewichte[p.id];
      if (x < 0) return p.id;
    }
    return aktiv[aktiv.length - 1].id;
  }

  function pruefcode(rand01) {
    let s = '';
    for (let i = 0; i < CODE_LAENGE; i++) {
      s += CODE_ZEICHEN[Math.floor(rand01() * CODE_ZEICHEN.length)];
    }
    return s;
  }

  function verkaufen(stand, config, preise, rand01, jetzt) {
    const nr = stand.lose.reduce((m, l) => Math.max(m, l.nr), 0) + 1;
    const los = { nr, t: jetzt, preis: config.preis, erg: auslosen(config, preise, rand01), pruef: pruefcode(rand01) };
    stand.lose.push(los);
    return los;
  }

  // Storno geht nur, solange das Los nicht gezogen wurde.
  function stornieren(stand, nr) {
    const los = stand.lose.find((l) => l.nr === nr);
    if (!los || los.storno) return false;
    if (Object.values(stand.ziehung).some((liste) => liste.includes(nr))) return false;
    los.storno = true;
    return true;
  }

  const nrText = (nr) => String(nr).padStart(4, '0');

  function losLink(basis, los) {
    return basis.split('#')[0] + '#' + los.nr + '-' + los.erg + '-' + los.pruef;
  }

  function linkLesen(hash, preise) {
    const m = /^#?(\d{1,6})-([A-Za-z]{1,12})-([A-Z2-9]{4})$/.exec(String(hash || ''));
    if (!m) return null;
    const nr = Number(m[1]);
    const erg = m[2];
    if (nr < 1) return null;
    if (erg !== NIETE && erg !== GLUEHWEIN && erg !== BIER && !preise.some((p) => p.id === erg)) return null;
    return { nr, erg, pruef: m[3] };
  }

  function gezogene(stand, id) { return stand.ziehung[id] || []; }

  // Lose, die im Topf liegen und noch gezogen werden können.
  function imTopf(stand, id) {
    const raus = gezogene(stand, id).concat(stand.verfallen[id] || []);
    return stand.lose.filter((l) => l.erg === id && !l.storno && !raus.includes(l.nr));
  }

  function topfFertig(stand, preis) {
    return gezogene(stand, preis.id).length >= preis.ziehungen;
  }

  // Zieht ein Los aus dem Topf. Gibt die Losnummer zurück oder null.
  function ziehen(stand, preis, rand01) {
    if (topfFertig(stand, preis)) return null;
    const lose = imTopf(stand, preis.id);
    if (!lose.length) return null;
    const los = lose[Math.floor(rand01() * lose.length)];
    stand.ziehung[preis.id] = gezogene(stand, preis.id).concat(los.nr);
    return los.nr;
  }

  // Preis nicht abgeholt: Die Nummer verfällt, eine andere wird gezogen.
  function neuZiehen(stand, preis, nr, rand01) {
    const liste = gezogene(stand, preis.id);
    if (!liste.includes(nr)) return null;
    stand.ziehung[preis.id] = liste.filter((n) => n !== nr);
    stand.verfallen[preis.id] = (stand.verfallen[preis.id] || []).concat(nr);
    return ziehen(stand, preis, rand01);
  }

  // Inhalt der Datei gewinner.json. Prüfcodes stehen absichtlich nicht drin.
  function gewinnerDatei(stand, config, preise, jetzt) {
    const gewinner = [];
    const fertig = [];
    preise.forEach((p) => {
      gezogene(stand, p.id).forEach((nr) => gewinner.push({ nr, topf: p.id }));
      if (topfFertig(stand, p) || (gezogene(stand, p.id).length && !imTopf(stand, p.id).length)) fertig.push(p.id);
    });
    return { stand: new Date(jetzt).toISOString(), abholfrist: config.abholfrist, fertig, gewinner };
  }

  // Was die Los-Seite zeigt.
  function losStatus(los, datei) {
    if (los.erg === NIETE) return 'niete';
    if (los.erg === GLUEHWEIN) return 'gluehwein';
    if (los.erg === BIER) return 'bier';
    const gewinner = datei && Array.isArray(datei.gewinner) ? datei.gewinner : [];
    if (gewinner.some((g) => g.nr === los.nr && g.topf === los.erg)) return 'gewonnen';
    if (datei && Array.isArray(datei.fertig) && datei.fertig.includes(los.erg)) return 'nichtGezogen';
    return 'imTopf';
  }

  // Was die Seite mit den Gewinnnummern zeigt: je Preis die gezogenen Nummern.
  function gewinnerListe(datei, preise) {
    const gewinner = datei && Array.isArray(datei.gewinner) ? datei.gewinner : [];
    const fertig = datei && Array.isArray(datei.fertig) ? datei.fertig : [];
    return preise.map((p) => ({
      id: p.id,
      name: p.name,
      ziehungen: p.ziehungen,
      nummern: gewinner.filter((g) => g.topf === p.id).map((g) => g.nr),
      fertig: fertig.includes(p.id)
    }));
  }

  // Wurde diese Losnummer gezogen? Gibt den Preis zurück oder null.
  function nummerSuchen(datei, preise, nr) {
    const n = Number(nr);
    const treffer = gewinnerListe(datei, preise).find((z) => z.nummern.includes(n));
    return treffer ? preise.find((p) => p.id === treffer.id) : null;
  }

  // Links, mit denen ein Kunde dem Verein sein Los schicken kann (E-Mail, WhatsApp).
  // Ohne gültige Adresse in daten.js gibt es keinen Link – und damit keinen Knopf am Los.
  function kontaktLinks(kontakt, betreff, text) {
    const k = kontakt && typeof kontakt === 'object' ? kontakt : {};
    const links = [];
    const mail = String(k.mail || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      links.push({ art: 'mail', href: 'mailto:' + mail + '?subject=' + encodeURIComponent(betreff) + '&body=' + encodeURIComponent(text) });
    }
    // WhatsApp braucht die Nummer mit Ländervorwahl und ohne Zeichen. "0660 …" gilt als österreichische Nummer.
    let nummer = String(k.whatsapp || '').replace(/\D/g, '');
    if (nummer.startsWith('00')) nummer = nummer.slice(2);
    else if (nummer.startsWith('0')) nummer = '43' + nummer.slice(1);
    if (nummer.length >= 8) links.push({ art: 'whatsapp', href: 'https://wa.me/' + nummer + '?text=' + encodeURIComponent(text) });
    return links;
  }

  // Abholung am Stand: Nummer und Prüfcode gegen die Verkaufsliste prüfen.
  function losPruefen(stand, nr, pruef) {
    const los = stand.lose.find((l) => l.nr === Number(nr));
    if (!los) return { status: 'unbekannt' };
    if (los.pruef !== String(pruef || '').trim().toUpperCase()) return { status: 'falscherCode' };
    if (los.storno) return { status: 'storno', los };
    const gewonnen = gezogene(stand, los.erg).includes(los.nr);
    return { status: 'ok', los, gewonnen };
  }

  const tagVon = (t) => {
    const d = new Date(t);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  };

  function statistik(stand, preise, jetzt) {
    const gueltig = stand.lose.filter((l) => !l.storno);
    const heute = tagVon(jetzt);
    const toepfe = {};
    preise.forEach((p) => { toepfe[p.id] = gueltig.filter((l) => l.erg === p.id).length; });
    return {
      gesamt: gueltig.length,
      heute: gueltig.filter((l) => tagVon(l.t) === heute).length,
      nieten: gueltig.filter((l) => l.erg === NIETE).length,
      gluehwein: gueltig.filter((l) => l.erg === GLUEHWEIN).length,
      bier: gueltig.filter((l) => l.erg === BIER).length,
      storniert: stand.lose.length - gueltig.length,
      einnahmen: gueltig.reduce((s, l) => s + (Number(l.preis) || 0), 0),
      toepfe
    };
  }

  function sicherung(stand, config, jetzt) {
    return { art: 'tombola-sicherung', version: 1, erstellt: new Date(jetzt).toISOString(), config, stand };
  }

  function sicherungLesen(obj, preise) {
    if (!obj || obj.art !== 'tombola-sicherung' || !obj.stand || !Array.isArray(obj.stand.lose)) {
      throw new Error('Das ist keine Sicherungsdatei der Tombola.');
    }
    const ok = obj.stand.lose.every((l) =>
      Number.isInteger(l.nr) && l.nr > 0 && typeof l.erg === 'string' && typeof l.pruef === 'string');
    if (!ok) throw new Error('Die Sicherungsdatei ist beschädigt.');
    return { stand: standPruefen(obj.stand), config: configPruefen(obj.config, preise) };
  }

  const api = {
    NIETE, GLUEHWEIN, BIER, STANDARD_CONFIG,
    configPruefen, leererStand, standPruefen,
    auslosen, pruefcode, verkaufen, stornieren,
    nrText, losLink, linkLesen,
    imTopf, gezogene, topfFertig, ziehen, neuZiehen,
    gewinnerDatei, losStatus, gewinnerListe, nummerSuchen, kontaktLinks, losPruefen, statistik,
    sicherung, sicherungLesen
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Tombola = api;
})(typeof self !== 'undefined' ? self : this);
