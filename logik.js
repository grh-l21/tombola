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

  // Verkaufen mehrere Geräte in eine gemeinsame Liste, bekommt jedes einen eigenen Nummernbereich –
  // so vergeben zwei Geräte nie dieselbe Nummer, auch nicht ohne Empfang.
  // Gerät 1 zählt 1 bis 9999, Gerät 2 zählt 20001 bis 29999 und so weiter.
  function bereich(geraet) {
    return geraet > 1 ? [geraet * 10000 + 1, geraet * 10000 + 9999] : [1, 9999];
  }

  function verkaufen(stand, config, preise, rand01, jetzt, geraet) {
    const [von, bis] = bereich(geraet || 1);
    const nr = stand.lose.reduce((m, l) => (l.nr >= von && l.nr <= bis ? Math.max(m, l.nr) : m), von - 1) + 1;
    if (nr > bis) throw new Error('Der Nummernbereich dieses Geräts ist voll.');
    const los = { nr, t: jetzt, preis: config.preis, erg: auslosen(config, preise, rand01), pruef: pruefcode(rand01) };
    stand.lose.push(los);
    return los;
  }

  // Storno geht nur, solange das Los nicht gezogen wurde.
  // Mit mehreren Geräten kann es trotzdem passieren, dass ein gezogenes Los storniert ist: wenn ein Gerät storniert,
  // bevor es von der Ziehung erfährt. Dann gilt das Storno – siehe gueltigGezogene.
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

  // Gezogene Nummern, deren Los storniert wurde. Sie zählen nicht als Gewinner.
  function stornoGezogen(stand, id) {
    const storniert = new Set(stand.lose.filter((l) => l.storno).map((l) => l.nr));
    return gezogene(stand, id).filter((nr) => storniert.has(nr));
  }
  function gueltigGezogene(stand, id) {
    const raus = stornoGezogen(stand, id);
    return raus.length ? gezogene(stand, id).filter((nr) => !raus.includes(nr)) : gezogene(stand, id);
  }

  // Lose, die im Topf liegen und noch gezogen werden können.
  function imTopf(stand, id) {
    const raus = gezogene(stand, id).concat(stand.verfallen[id] || []);
    return stand.lose.filter((l) => l.erg === id && !l.storno && !raus.includes(l.nr));
  }

  function topfFertig(stand, preis) {
    return gueltigGezogene(stand, preis.id).length >= preis.ziehungen;
  }

  // Zieht ein Los aus dem Topf. Gibt die Losnummer zurück oder null.
  // Eine gezogene Nummer, deren Los inzwischen storniert ist, verfällt dabei.
  function ziehen(stand, preis, rand01) {
    const storniert = stornoGezogen(stand, preis.id);
    if (storniert.length) {
      stand.ziehung[preis.id] = gueltigGezogene(stand, preis.id);
      stand.verfallen[preis.id] = (stand.verfallen[preis.id] || []).concat(storniert);
    }
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
      const gueltig = gueltigGezogene(stand, p.id);
      gueltig.forEach((nr) => gewinner.push({ nr, topf: p.id }));
      if (topfFertig(stand, p) || (gueltig.length && !imTopf(stand, p.id).length)) fertig.push(p.id);
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

  // Preis oder Getränk wurde übergeben: einmal vermerken, mit Uhrzeit. So fällt auf, wenn dasselbe Los zweimal kommt.
  function ausgeben(stand, nr, jetzt) {
    const los = stand.lose.find((l) => l.nr === Number(nr));
    if (!los || los.storno || los.aus) return false;
    los.aus = jetzt;
    return true;
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

  // ---------- Mehrere Geräte: Team-Code und Abgleich mit der gemeinsamen Liste ----------
  // Jedes Gerät führt weiter seine eigene Liste und gleicht sie mit der Ablage im Internet ab (ablage/worker.js).
  // "sync" merkt sich je Gerät, was noch nicht abgegeben ist und was es von der Ablage schon kennt.

  const TEAM_LAENGE = 16;
  const PAKET = 50;   // so viele Lose gehen höchstens in eine Anfrage

  function teamCode(rand01) {
    let s = '';
    for (let i = 0; i < TEAM_LAENGE; i++) s += CODE_ZEICHEN[Math.floor(rand01() * CODE_ZEICHEN.length)];
    return s;
  }

  const codeText = (code) => String(code).replace(/(.{4})(?=.)/g, '$1-');

  function codeLesen(text) {
    const c = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return new RegExp('^[' + CODE_ZEICHEN + ']{' + TEAM_LAENGE + '}$').test(c) ? c : null;
  }

  // Der Link im QR-Code "Gerät hinzufügen": die Internet-Adresse der Tombola (daten.js) mit dem Team-Code.
  // Ist keine hinterlegt, gilt die Adresse, unter der die App gerade läuft.
  function teamLink(adresse, seite, code) {
    const fest = String(adresse || '').trim();
    const basis = fest ? fest.replace(/\/?$/, '/') : new URL('./', seite).href;
    return basis.split('#')[0].split('?')[0] + '#team=' + code;
  }

  // "localhost" ist nur am selben Gerät erreichbar – ein Handy kommt dort nicht hin.
  function nurAmGeraet(adresse) {
    try {
      return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(adresse).hostname);
    } catch (e) {
      return false;
    }
  }

  // Diese Einstellungen gelten für alle Geräte gemeinsam. Die Adresse der Los-Seite bleibt je Gerät.
  function gemeinsameConfig(config) {
    const { preis, quoteGluehwein, quoteBier, quoteTopf, gewichte, abholfrist } = config;
    return { preis, quoteGluehwein, quoteBier, quoteTopf, gewichte, abholfrist };
  }

  // Neuer Merkzettel nach dem Anlegen der Liste oder dem Beitreten.
  // Wer die Liste anlegt, liefert seine vorhandenen Lose, die Ziehung und die Einstellungen nach.
  function abgleichNeu(code, beitritt, stand, anleger) {
    const [von, bis] = bereich(beitritt.geraet);
    const eigene = anleger ? stand.lose.filter((l) => l.nr >= von && l.nr <= bis) : [];
    const gezogen = Object.keys(stand.ziehung).length + Object.keys(stand.verfallen).length > 0;
    return {
      code, geraet: beitritt.geraet, name: beitritt.name || '', epoche: beitritt.epoche,
      cursor: 0, ziehungV: 0, configV: 0, kontakt: 0, geraete: [],
      offen: {
        lose: eigene.map((l) => l.nr),
        storno: eigene.filter((l) => l.storno).map((l) => l.nr),
        aus: eigene.filter((l) => l.aus).map((l) => l.nr),
        ziehung: anleger && gezogen ? 1 : 0,
        config: anleger ? 1 : 0
      }
    };
  }

  // Merkzettel aus einer älteren Fassung der App kennen "ausgegeben" noch nicht.
  const ausOffen = (sync) => (Array.isArray(sync.offen.aus) ? sync.offen.aus : (sync.offen.aus = []));

  // Nach jeder Änderung am Gerät: vormerken, was die Ablage noch nicht hat.
  function abgleichVormerken(sync, was) {
    if (was.aus !== undefined && !ausOffen(sync).includes(was.aus)) ausOffen(sync).push(was.aus);
    if (was.los !== undefined && !sync.offen.lose.includes(was.los)) sync.offen.lose.push(was.los);
    if (was.storno !== undefined && !sync.offen.storno.includes(was.storno)) sync.offen.storno.push(was.storno);
    if (was.ziehung) sync.offen.ziehung += 1;
    if (was.config) sync.offen.config += 1;
  }

  const abgleichOffen = (sync) =>
    sync.offen.lose.length > 0 || sync.offen.storno.length > 0 || ausOffen(sync).length > 0 || sync.offen.ziehung > 0 || sync.offen.config > 0;

  // Was dieses Gerät der Ablage schickt.
  function abgleichAnfrage(sync, stand, config) {
    const paket = sync.offen.lose.slice(0, PAKET);
    const spaeter = sync.offen.lose.slice(PAKET);
    const nachNr = new Map(stand.lose.map((l) => [l.nr, l]));
    // Ein Storno geht erst mit, wenn auch sein Los bei der Ablage ist.
    const storno = sync.offen.storno.filter((nr) => !spaeter.includes(nr)).slice(0, PAKET);
    const aus = ausOffen(sync).filter((nr) => !spaeter.includes(nr)).slice(0, PAKET);
    const a = {
      code: sync.code, geraet: sync.geraet, epoche: sync.epoche, seit: sync.cursor,
      lose: paket.filter((nr) => nachNr.has(nr)).map((nr) => {
        const { t, preis, erg, pruef } = nachNr.get(nr);
        return { nr, t, preis, erg, pruef };
      }),
      storno
    };
    // Die Liste gibt es nur, wenn etwas vermerkt ist – eine ältere Ablage kennt sie nicht.
    if (aus.length) a.aus = aus.filter((nr) => nachNr.has(nr) && nachNr.get(nr).aus).map((nr) => ({ nr, t: nachNr.get(nr).aus }));
    if (sync.offen.ziehung) a.ziehung = { basis: sync.ziehungV, wert: { ziehung: stand.ziehung, verfallen: stand.verfallen } };
    if (sync.offen.config) a.config = gemeinsameConfig(config);
    // Merkt sich, was genau unterwegs ist – ohne dass es mitgeschickt wird.
    Object.defineProperty(a, 'merk', { value: { lose: paket, storno, aus, ziehung: sync.offen.ziehung, config: sync.offen.config } });
    return a;
  }

  function standLeeren(stand) {
    stand.lose = [];
    stand.ziehung = {};
    stand.verfallen = {};
  }

  // Die Antwort der Ablage einarbeiten. Ändert stand und sync, gibt die gültigen Einstellungen
  // und gegebenenfalls eine Meldung zurück: 'geleert' oder 'ziehungAbgelehnt'.
  function abgleichAntwort(sync, stand, config, anfrage, antwort, preise, jetzt) {
    const merk = anfrage.merk;
    const aktuell = antwort.epoche === sync.epoche;
    let meldung;
    let eigeneZiehungGilt = false;

    if (!aktuell) {
      // Ein anderes Gerät hat die Liste für alle geleert: Auch hier beginnt eine neue Runde.
      // Erhalten bleibt nur, was dieses Gerät erst nach dem Leeren verkauft und noch nicht abgegeben hat –
      // es wusste noch nichts vom Leeren, und diese Lose sind echte Verkäufe der neuen Runde.
      const [von, bis] = bereich(sync.geraet);
      const behalten = typeof antwort.geleert === 'number'
        ? stand.lose.filter((l) => l.nr >= von && l.nr <= bis && sync.offen.lose.includes(l.nr) && l.t > antwort.geleert)
        : [];
      standLeeren(stand);
      stand.lose = behalten;
      sync.epoche = antwort.epoche;
      sync.offen = {
        lose: behalten.map((l) => l.nr),
        storno: behalten.filter((l) => l.storno).map((l) => l.nr),
        aus: behalten.filter((l) => l.aus).map((l) => l.nr),
        ziehung: 0,
        config: sync.offen.config
      };
      meldung = 'geleert';
    } else {
      sync.offen.lose = sync.offen.lose.filter((nr) => !merk.lose.includes(nr));
      sync.offen.storno = sync.offen.storno.filter((nr) => !merk.storno.includes(nr));
      sync.offen.aus = ausOffen(sync).filter((nr) => !merk.aus.includes(nr));
      if (antwort.ziehungAbgelehnt) {
        // Ein anderes Gerät hat zuerst gezogen. Die eigene Ziehung wird verworfen.
        sync.offen.ziehung = 0;
        meldung = 'ziehungAbgelehnt';
      } else if (merk.ziehung) {
        eigeneZiehungGilt = true;
        if (sync.offen.ziehung === merk.ziehung) sync.offen.ziehung = 0;
      }
      if (merk.config && sync.offen.config === merk.config) sync.offen.config = 0;
    }

    const nachNr = new Map(stand.lose.map((l) => [l.nr, l]));
    antwort.lose.forEach((l) => {
      const da = nachNr.get(l.nr);
      if (!da) stand.lose.push(l);
      else {
        if (l.storno) da.storno = true;
        // Der bei der Ablage zuerst angekommene Vermerk gilt auf allen Geräten – auch vor einem eigenen, noch nicht abgegebenen.
        if (l.aus) da.aus = l.aus;
      }
    });
    stand.lose.sort((a, b) => a.t - b.t || a.nr - b.nr);

    if (!sync.offen.ziehung) {
      if (antwort.ziehung.v !== sync.ziehungV || meldung) {
        const w = antwort.ziehung.wert || {};
        stand.ziehung = w.ziehung || {};
        stand.verfallen = w.verfallen || {};
      }
      sync.ziehungV = antwort.ziehung.v;
    } else if (eigeneZiehungGilt) {
      sync.ziehungV = antwort.ziehung.v;
    }
    // Sonst bleibt der bekannte Stand stehen: Hat inzwischen ein anderes Gerät gezogen,
    // lehnt die Ablage die eigene, noch offene Ziehung beim nächsten Abgleich ab.

    if (!sync.offen.config) {
      if (antwort.config.v !== sync.configV && antwort.config.wert) {
        config = configPruefen({ ...antwort.config.wert, losSeite: config.losSeite }, preise);
      }
      sync.configV = antwort.config.v;
    }

    sync.cursor = antwort.cursor;
    sync.kontakt = jetzt;
    sync.geraete = antwort.geraete;
    return { config, meldung };
  }

  // Dieses Gerät hat die Liste selbst für alle geleert.
  function abgleichGeleert(sync, stand, epoche) {
    standLeeren(stand);
    sync.epoche = epoche;
    sync.cursor = 0;
    sync.offen = { lose: [], storno: [], aus: [], ziehung: 0, config: sync.offen.config };
  }

  const api = {
    NIETE, GLUEHWEIN, BIER, STANDARD_CONFIG,
    configPruefen, leererStand, standPruefen,
    auslosen, pruefcode, verkaufen, stornieren,
    nrText, losLink, linkLesen,
    imTopf, gezogene, stornoGezogen, gueltigGezogene, topfFertig, ziehen, neuZiehen,
    gewinnerDatei, losStatus, kontaktLinks, losPruefen, ausgeben, statistik,
    sicherung, sicherungLesen,
    bereich, teamCode, codeText, codeLesen, teamLink, nurAmGeraet,
    abgleichNeu, abgleichVormerken, abgleichOffen, abgleichAnfrage, abgleichAntwort, abgleichGeleert
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Tombola = api;
})(typeof self !== 'undefined' ? self : this);
