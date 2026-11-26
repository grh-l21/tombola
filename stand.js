// Stand-App: Verkauf, Ziehung, Einstellungen. Alles liegt im Speicher dieses Geräts.
(function () {
  const T = window.Tombola;
  const DATEN = window.TOMBOLA_DATEN;
  const PREISE = DATEN.preise;
  const LS_CONFIG = 'tombola.config.v1';
  const LS_STAND = 'tombola.stand.v1';
  const LS_SYNC = 'tombola.sync.v1';

  const $ = (id) => document.getElementById(id);
  const el = (tag, klasse, text) => {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const zahl = (n) => Number(n).toLocaleString('de-AT');
  const preisVon = (id) => PREISE.find((p) => p.id === id);

  // ---------- Speicher ----------
  let speicherOk = true;
  try {
    localStorage.setItem('tombola.test', '1');
    localStorage.removeItem('tombola.test');
  } catch (e) { speicherOk = false; }

  function lesen(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function schreiben(key, wert) {
    try { localStorage.setItem(key, JSON.stringify(wert)); } catch (e) { speicherOk = false; }
    $('speicherWarnung').hidden = speicherOk;
  }

  let config = T.configPruefen(lesen(LS_CONFIG), PREISE);
  let stand = T.standPruefen(lesen(LS_STAND));
  const standSpeichern = () => schreiben(LS_STAND, stand);
  const configSpeichern = () => schreiben(LS_CONFIG, config);

  // Merkzettel für die gemeinsame Liste mehrerer Geräte; null = dieses Gerät verkauft nur für sich.
  function syncLesen() {
    const s = lesen(LS_SYNC);
    return s && typeof s === 'object' && s.code && s.geraet && s.offen ? s : null;
  }
  let sync = syncLesen();
  function syncSpeichern() {
    if (sync) schreiben(LS_SYNC, sync);
    else { try { localStorage.removeItem(LS_SYNC); } catch (e) { /* privater Modus */ } }
  }

  // Maßgeblich ist der Speicher des Geräts, nicht dieses Fenster. Ist die App ein zweites Mal offen
  // (zweiter Tab, ein Fenster von gestern), hat das andere Fenster vielleicht inzwischen verkauft.
  // Darum vor jeder Änderung neu lesen – sonst überschreibt ein altes Fenster die Lose des anderen.
  function nachladen() {
    const s = lesen(LS_STAND);
    if (s) stand = T.standPruefen(s);
    const c = lesen(LS_CONFIG);
    if (c) config = T.configPruefen(c, PREISE);
    if (speicherOk) sync = syncLesen();
  }
  // Hinter einem offenen Los wird nicht neu gezeichnet – die Listen würden das Ergebnis verraten.
  function auffrischen() {
    nachladen();
    if (!$('losDialog').open) zeichnen();
  }
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === LS_STAND || e.key === LS_CONFIG || e.key === LS_SYNC) auffrischen();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { auffrischen(); abgleichen(); } });
  window.addEventListener('pageshow', (e) => { if (e.persisted) auffrischen(); });

  function rand01() {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0] / 4294967296;
  }

  // ---------- Rückfrage ----------
  function frage(text, ja) {
    return new Promise((fertig) => {
      const d = $('frageDialog');
      $('frageText').textContent = text;
      $('frageJa').textContent = ja || 'Ja';
      d.returnValue = 'nein';
      d.addEventListener('close', () => fertig(d.returnValue === 'ja'), { once: true });
      // Reine Mitteilungen ("OK") brauchen kein "Abbrechen".
      const nurOk = ja === 'OK';
      $('frageNein').hidden = nurOk;
      d.showModal();
      (nurOk ? $('frageJa') : $('frageNein')).focus();
    });
  }

  function herunterladen(name, inhalt) {
    const blob = new Blob([JSON.stringify(inhalt, null, 2)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Texte ----------
  function ergebnisText(erg) {
    if (erg === T.NIETE) return 'Niete';
    if (erg === T.GLUEHWEIN) return 'Glühwein';
    if (erg === T.BIER) return 'Schnaitl';
    const p = preisVon(erg);
    return 'Topf: ' + (p ? p.name : erg);
  }
  const uhrzeit = (t) => new Date(t).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });

  function losSeite() {
    return config.losSeite || new URL('los.html', location.href).href;
  }
  const nurDiesesGeraet = () => !config.losSeite && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  // ---------- Reiter ----------
  const reiter = Array.from(document.querySelectorAll('.reiter button'));
  function zeige(ansicht) {
    reiter.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ansicht === ansicht)));
    ['verkauf', 'ziehung', 'einstellungen'].forEach((id) => { $(id).hidden = id !== ansicht; });
    zeichnen();
  }
  reiter.forEach((b) => b.addEventListener('click', () => zeige(b.dataset.ansicht)));

  // ---------- Verkauf ----------
  let offenesLos = null;

  $('verkaufen').addEventListener('click', () => {
    nachladen();
    let los;
    try {
      los = T.verkaufen(stand, config, PREISE, rand01, Date.now(), sync ? sync.geraet : 1);
    } catch (e) {
      frage(e.message, 'OK');
      return;
    }
    // Erst auf dem Gerät speichern, dann an die gemeinsame Liste schicken – so geht kein Los verloren, auch ohne Empfang.
    if (sync) T.abgleichVormerken(sync, { los: los.nr });
    standSpeichern();
    syncSpeichern();
    zeigeLos(los);   // Die Listen dahinter werden erst nach dem Schließen neu gezeichnet – sonst verraten sie das Ergebnis.
    abgleichen();
  });

  function zeigeLos(los) {
    offenesLos = los;
    const link = T.losLink(losSeite(), los);
    $('qr').innerHTML = QR.svg(link);
    $('linkZeile').textContent = nurDiesesGeraet()
      ? 'Achtung: Dieser QR-Code führt auf „localhost“ und ist von Handys aus nicht erreichbar. Adresse in den Einstellungen eintragen.'
      : link;
    $('dNr').textContent = 'Nr. ' + T.nrText(los.nr);
    $('dCode').textContent = '';
    const feld = $('dErgebnis');
    feld.className = 'verdeckt';
    delete feld.dataset.art;
    feld.replaceChildren(el('span', '', 'Ergebnis zeigen'), el('small', '', 'für den Ausschank oder wenn kein Handy da ist'));
    $('losDialog').showModal();
    $('dFertig').focus();
  }

  $('dErgebnis').addEventListener('click', () => {
    const los = offenesLos;
    const feld = $('dErgebnis');
    if (!los || feld.classList.contains('offen')) return;
    feld.className = 'verdeckt offen' + (los.erg === T.NIETE ? '' : ' gewinn');
    // Dieselben Farben wie am Handy: Glühwein rot, Schnaitl grün, Lostopf nachtblau, Niete hell.
    feld.dataset.art = los.erg === T.NIETE ? 'niete' : los.erg === T.GLUEHWEIN ? 'gluehwein' : los.erg === T.BIER ? 'bier' : 'topf';
    const p = preisVon(los.erg);
    if (los.erg === T.NIETE) {
      feld.replaceChildren(el('span', 'block', 'Niete'), el('small', '', 'Leider nichts gewonnen.'));
    } else if (los.erg === T.GLUEHWEIN) {
      feld.replaceChildren(el('span', 'block', 'Glühwein'), el('small', '', 'Jetzt einen Glühwein ausschenken.'));
    } else if (los.erg === T.BIER) {
      feld.replaceChildren(el('span', 'block', 'Schnaitl'), el('small', '', 'Jetzt ein Schnaitl (0,3 l) ausgeben.'));
    } else {
      feld.replaceChildren(el('small', '', 'Im Lostopf für'), el('span', 'block', p.name), el('small', '', 'Losnummer und Prüfcode mitgeben.'));
    }
    $('dCode').textContent = 'Prüfcode ' + los.pruef;
  });

  $('dFertig').addEventListener('click', () => $('losDialog').close());
  $('dStorno').addEventListener('click', async () => {
    const los = offenesLos;
    if (!los) return;
    if (!await frage('Los Nr. ' + T.nrText(los.nr) + ' stornieren? Es zählt dann nicht mehr und nimmt an keiner Ziehung teil.', 'Stornieren')) return;
    nachladen();
    if (T.stornieren(stand, los.nr) && sync) T.abgleichVormerken(sync, { storno: los.nr });
    standSpeichern();
    syncSpeichern();
    $('losDialog').close();
    zeichnen();
    abgleichen();
  });
  $('losDialog').addEventListener('close', () => { offenesLos = null; zeichnen(); $('verkaufen').focus(); });

  function zeichneVerkauf() {
    const st = T.statistik(stand, PREISE, Date.now());
    $('preisText').textContent = config.preis ? zahl(config.preis) + ' € pro Los' : '';
    $('zHeute').textContent = zahl(st.heute);
    $('zGesamt').textContent = zahl(st.gesamt);
    $('zEinnahmen').textContent = zahl(st.einnahmen);
    $('zGluehwein').textContent = zahl(st.gluehwein);
    $('zBier').textContent = zahl(st.bier);

    $('topfListe').replaceChildren(...PREISE.map((p) => {
      const li = el('li');
      li.append(el('span', '', p.name + (p.ziehungen > 1 ? ' (' + p.ziehungen + ' Ziehungen)' : '')), el('b', 'ziffern', zahl(st.toepfe[p.id])));
      return li;
    }));

    const letzte = stand.lose.slice(-6).reverse();
    const liste = $('letzte');
    if (!letzte.length) {
      liste.replaceChildren(el('li', 'leer', 'Noch kein Los verkauft.'));
      return;
    }
    liste.replaceChildren(...letzte.map((los) => {
      const li = el('li', los.storno ? 'storno' : '');
      li.append(
        el('span', 'nr ziffern', 'Nr. ' + T.nrText(los.nr)),
        el('span', 'zeit ziffern', uhrzeit(los.t)),
        el('span', 'erg' + ((los.erg === T.GLUEHWEIN || los.erg === T.BIER) && !los.storno ? ' marke-g' : ''), ergebnisText(los.erg) + (los.storno ? ' (storniert)' : ''))
      );
      return li;
    }));
  }

  // ---------- Ziehung ----------
  // Mit gemeinsamer Liste wird nur gezogen, wenn dieses Gerät gerade alle Lose der anderen geholt hat.
  async function vorZiehung() {
    if (!sync) return true;
    if (await abgleichen()) return true;
    await frage('Für die Ziehung braucht dieses Gerät Verbindung zur gemeinsamen Liste – sonst könnten Lose anderer Geräte fehlen. Bitte Empfang prüfen und noch einmal versuchen.', 'OK');
    return false;
  }
  function nachZiehung() {
    if (sync) T.abgleichVormerken(sync, { ziehung: true });
    standSpeichern();
    syncSpeichern();
    zeichnen();
    abgleichen();
  }

  function zeichneGeraete() {
    $('geraeteKasten').hidden = !sync;
    if (!sync) return;
    const jetzt = Date.now();
    const liste = sync.geraete || [];
    $('geraeteListe').replaceChildren(...(liste.length ? liste : [{ nr: sync.geraet, name: sync.name, lose: 0, kontakt: 0 }]).map((g) => {
      const li = el('li');
      const spaet = g.nr !== sync.geraet && jetzt - g.kontakt > 5 * 60 * 1000;
      li.append(
        el('span', 'geraet', 'Gerät ' + g.nr + (g.name && g.name !== 'Gerät ' + g.nr ? ' · ' + g.name : '') + (g.nr === sync.geraet ? ' (dieses Gerät)' : '')),
        el('span', 'ziffern', zahl(g.lose) + (g.lose === 1 ? ' Los' : ' Lose')),
        el('span', spaet ? 'spaet' : 'matt', g.kontakt ? (spaet ? 'zuletzt gemeldet ' : 'gemeldet ') + uhrzeit(g.kontakt) : 'noch nicht gemeldet')
      );
      return li;
    }));
  }

  function zeichneZiehung() {
    zeichneGeraete();
    $('toepfe').replaceChildren(...PREISE.map((p) => {
      const karte = el('article', 'topf');
      const gezogen = T.gezogene(stand, p.id);
      const rest = T.imTopf(stand, p.id).length;
      karte.append(el('h3', '', p.name));
      karte.append(el('div', 'matt', zahl(rest) + (rest === 1 ? ' Los' : ' Lose') + ' im Topf · ' + gezogen.length + ' von ' + p.ziehungen + ' gezogen'));

      if (gezogen.length) {
        const ul = el('ul', 'gezogen');
        gezogen.forEach((nr) => {
          const li = el('li');
          const neu = el('button', 'knopf leise', 'Neu ziehen');
          neu.addEventListener('click', async () => {
            const text = 'Los Nr. ' + T.nrText(nr) + ' verfällt und es wird ein anderes gezogen. Nur verwenden, wenn der Preis nicht abgeholt wurde.';
            if (!await frage(text, 'Neu ziehen')) return;
            if (!await vorZiehung()) return;
            nachladen();
            T.neuZiehen(stand, p, nr, rand01);
            nachZiehung();
          });
          li.append(el('span', 'nummer ziffern', 'Nr. ' + T.nrText(nr)), neu);
          ul.append(li);
        });
        karte.append(ul);
      }

      const knopf = el('button', 'knopf rot');
      if (T.topfFertig(stand, p)) {
        knopf.textContent = 'Fertig gezogen';
        knopf.disabled = true;
      } else if (!rest) {
        knopf.textContent = 'Kein Los im Topf';
        knopf.disabled = true;
      } else {
        knopf.textContent = p.ziehungen > 1 ? 'Ziehen (' + (gezogen.length + 1) + ' von ' + p.ziehungen + ')' : 'Ziehen';
        knopf.addEventListener('click', async () => {
          if (!await frage('Jetzt für „' + p.name + '“ ziehen?', 'Ziehen')) return;
          if (!await vorZiehung()) return;
          nachladen();
          T.ziehen(stand, p, rand01);
          nachZiehung();
        });
      }
      karte.append(knopf);
      return karte;
    }));
    if (document.activeElement !== $('abholfrist')) $('abholfrist').value = config.abholfrist;

    // Adresse und QR-Code der Seite mit den Gewinnnummern – sie liegt neben der Los-Seite.
    const liste = new URL('gewinner.html', losSeite()).href;
    if ($('listenQr').dataset.adresse !== liste) {
      $('listenQr').innerHTML = QR.svg(liste);
      $('listenQr').dataset.adresse = liste;
    }
    $('listenLink').textContent = nurDiesesGeraet()
      ? 'Achtung: Diese Adresse führt auf „localhost“ und ist von Handys aus nicht erreichbar. Adresse in den Einstellungen eintragen.'
      : liste;
  }

  $('abholfrist').addEventListener('change', (e) => {
    nachladen();
    config = T.configPruefen({ ...config, abholfrist: e.target.value }, PREISE);
    configGeaendert();
  });
  $('gewinnerLaden').addEventListener('click', () => {
    nachladen();
    herunterladen('gewinner.json', T.gewinnerDatei(stand, config, PREISE, Date.now()));
  });

  $('pruefForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sync) await abgleichen();   // damit auch ein eben erst verkauftes Los eines anderen Geräts bekannt ist
    nachladen();
    const r = T.losPruefen(stand, $('pruefNr').value.trim(), $('pruefCode').value);
    const aus = $('pruefErgebnis');
    let text;
    let gut = false;
    if (r.status === 'unbekannt') text = 'Diese Losnummer wurde hier nicht verkauft.';
    else if (r.status === 'falscherCode') text = 'Der Prüfcode passt nicht zu dieser Losnummer.';
    else if (r.status === 'storno') text = 'Dieses Los wurde storniert.';
    else if (r.gewonnen) { text = 'Gültig. Gewinn: ' + preisVon(r.los.erg).name + '.'; gut = true; }
    else if (r.los.erg === T.NIETE) text = 'Gültiges Los, aber eine Niete.';
    else if (r.los.erg === T.GLUEHWEIN) text = 'Gültiges Los: Glühwein, beim Verkauf ausgeschenkt.';
    else if (r.los.erg === T.BIER) text = 'Gültiges Los: Schnaitl, beim Verkauf ausgegeben.';
    else text = 'Gültiges Los im Topf „' + preisVon(r.los.erg).name + '“, wurde aber nicht gezogen.';
    aus.textContent = text;
    aus.className = 'ergebnis-zeile ' + (gut ? 'gut' : 'schlecht');
    aus.hidden = false;
  });

  // ---------- Einstellungen ----------
  // Preis, Quoten, Gewichte und Abholfrist gelten mit gemeinsamer Liste für alle Geräte.
  function configGeaendert() {
    if (sync) T.abgleichVormerken(sync, { config: true });
    configSpeichern();
    syncSpeichern();
    abgleichen();
  }

  function configAusFormular() {
    const gewichte = {};
    PREISE.forEach((p) => { gewichte[p.id] = $('gew-' + p.id).value; });
    nachladen();
    config = T.configPruefen({
      ...config,
      preis: $('fPreis').value,
      quoteGluehwein: $('fGluehwein').value,
      quoteBier: $('fBier').value,
      quoteTopf: $('fTopf').value,
      losSeite: $('fLosSeite').value,
      gewichte
    }, PREISE);
    configGeaendert();
    zeichnen();
  }

  function zeichneEinstellungen() {
    const setze = (id, wert) => { if (document.activeElement !== $(id)) $(id).value = wert; };
    setze('fPreis', config.preis);
    setze('fGluehwein', config.quoteGluehwein);
    setze('fBier', config.quoteBier);
    setze('fTopf', config.quoteTopf);
    setze('fLosSeite', config.losSeite);
    const niete = 100 - config.quoteGluehwein - config.quoteBier - config.quoteTopf;
    $('nietenText').textContent = 'Der Rest sind Nieten: ' + zahl(niete) + ' %. Die neuen Quoten gelten ab dem nächsten Los.';

    const summe = PREISE.reduce((s, p) => s + config.gewichte[p.id], 0);
    const tbody = $('gewichte');
    if (!tbody.children.length) {
      PREISE.forEach((p) => {
        const tr = el('tr');
        const eingabe = el('input');
        eingabe.id = 'gew-' + p.id;
        eingabe.type = 'number';
        eingabe.min = '0';
        eingabe.step = '1';
        eingabe.inputMode = 'numeric';
        eingabe.setAttribute('aria-label', 'Gewicht ' + p.name);
        eingabe.addEventListener('change', configAusFormular);
        const tdE = el('td', 'r');
        tdE.append(eingabe);
        const chance = el('td', 'r ziffern');
        chance.id = 'chance-' + p.id;
        tr.append(el('td', '', p.name), tdE, chance);
        tbody.append(tr);
      });
    }
    PREISE.forEach((p) => {
      setze('gew-' + p.id, config.gewichte[p.id]);
      const c = summe ? config.quoteTopf * config.gewichte[p.id] / summe : 0;
      $('chance-' + p.id).textContent = c.toLocaleString('de-AT', { maximumFractionDigits: 1 }) + ' %';
    });

    $('losSeiteText').textContent = nurDiesesGeraet()
      ? 'Die App läuft gerade unter „localhost“. Handys erreichen diese Adresse nicht – zum Testen die App über die Netzwerkadresse dieses Rechners öffnen oder hier eine Adresse eintragen.'
      : 'Aktuell im QR-Code: ' + losSeite();

    const offen = ungesichert();
    $('sicherungStand').textContent = (stand.letzteSicherung
      ? 'Letzte Sicherung: ' + new Date(stand.letzteSicherung).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) + '. '
      : 'Noch keine Sicherung. ')
      + (offen ? zahl(offen) + (offen === 1 ? ' Los ist' : ' Lose sind') + ' seither dazugekommen.' : 'Alles gesichert.');
  }

  ['fPreis', 'fGluehwein', 'fBier', 'fTopf', 'fLosSeite'].forEach((id) => $(id).addEventListener('change', configAusFormular));

  // ---------- Sicherung ----------
  const ungesichert = () => stand.lose.filter((l) => l.t > stand.letzteSicherung).length;

  function sichern() {
    nachladen();
    const jetzt = Date.now();
    const d = new Date(jetzt);
    const zwei = (n) => String(n).padStart(2, '0');
    const name = 'tombola-sicherung-' + d.getFullYear() + '-' + zwei(d.getMonth() + 1) + '-' + zwei(d.getDate())
      + '-' + zwei(d.getHours()) + zwei(d.getMinutes()) + '.json';
    stand.letzteSicherung = jetzt;
    herunterladen(name, T.sicherung(stand, config, jetzt));
    standSpeichern();
    zeichnen();
  }
  document.querySelectorAll('[data-aktion="sichern"]').forEach((b) => b.addEventListener('click', sichern));

  $('einspielen').addEventListener('click', () => $('sicherungDatei').click());
  $('sicherungDatei').addEventListener('change', async (e) => {
    const datei = e.target.files[0];
    e.target.value = '';
    if (!datei) return;
    nachladen();
    if (sync) {
      await frage('Solange dieses Gerät an der gemeinsamen Liste hängt, lässt sich keine Sicherung einspielen. Dafür zuerst die gemeinsame Liste verlassen.', 'OK');
      return;
    }
    let neu;
    try {
      neu = T.sicherungLesen(JSON.parse(await datei.text()), PREISE);
    } catch (err) {
      await frage(err instanceof SyntaxError ? 'Die Datei lässt sich nicht lesen.' : err.message, 'OK');
      return;
    }
    nachladen();
    const text = 'Sicherung mit ' + zahl(neu.stand.lose.length) + ' Losen einspielen? Die ' + zahl(stand.lose.length)
      + ' Lose, die jetzt auf diesem Gerät liegen, werden ersetzt.';
    if (!await frage(text, 'Einspielen')) return;
    stand = neu.stand;
    config = neu.config;
    standSpeichern();
    configSpeichern();
    zeichnen();
  });

  $('allesLoeschen').addEventListener('click', async () => {
    nachladen();
    if (sync) { fuerAlleLeeren(); return; }
    const text = 'Wirklich alle ' + zahl(stand.lose.length) + ' Lose und die Ziehung löschen? Zurückholen geht nur mit einer Sicherungsdatei.';
    if (!await frage(text, 'Alles löschen')) return;
    stand = T.leererStand();
    standSpeichern();
    zeichnen();
  });

  // Erinnerung am Tagesende: wenn seit 20 Minuten nichts mehr verkauft wurde
  // oder ungesicherte Lose von einem früheren Tag stammen. Im laufenden Verkauf stört sie nicht.
  const RUHE = 20 * 60 * 1000;
  function zeichneHinweis() {
    const offen = stand.lose.filter((l) => l.t > stand.letzteSicherung);
    const heute = new Date().toDateString();
    const alt = offen.some((l) => new Date(l.t).toDateString() !== heute);
    const zeigen = offen.length > 0 && (alt || Date.now() - offen[offen.length - 1].t > RUHE);
    $('sicherungHinweis').hidden = !zeigen;
    if (zeigen) {
      $('sicherungText').textContent = zahl(offen.length) + (offen.length === 1 ? ' Los ist' : ' Lose sind')
        + ' noch nicht gesichert. Bitte vor dem Zusammenräumen eine Sicherung exportieren.';
    }
  }

  // ---------- Gemeinsame Liste für mehrere Geräte ----------
  // Die Adresse der Ablage steht in daten.js. Zum Testen am Rechner lässt sie sich im Gerätespeicher überschreiben.
  const ABLAGE = String((() => { try { return localStorage.getItem('tombola.ablage.test'); } catch (e) { return null; } })() || DATEN.ablage || '').replace(/\/+$/, '');
  let abgleichFehler = null;     // null = der letzte Abgleich hat geklappt; sonst 'netz', 'unbekannt', 'geraet' …
  let abgleichLauf = null;

  async function ruf(pfad, body) {
    const abbruch = new AbortController();
    const frist = setTimeout(() => abbruch.abort(), 12000);
    try {
      // Ohne eigene Kopfzeilen: Dann fragt der Browser nicht bei jedem Abgleich doppelt an.
      const res = await fetch(ABLAGE + pfad, { method: 'POST', body: JSON.stringify(body), cache: 'no-store', signal: abbruch.signal });
      const daten = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error('Ablage: ' + res.status);
        e.kurz = daten.fehler || 'fehler';
        throw e;
      }
      return daten;
    } finally {
      clearTimeout(frist);
    }
  }

  // Gibt eigene Änderungen ab und holt die der anderen. Liefert true, wenn danach nichts mehr offen ist.
  function abgleichen() {
    if (!sync || !ABLAGE) return Promise.resolve(false);
    if (!abgleichLauf) abgleichLauf = abgleichLaufen().finally(() => { abgleichLauf = null; });
    return abgleichLauf;
  }

  async function abgleichLaufen() {
    try {
      for (let runde = 0; runde < 200; runde++) {
        nachladen();
        if (!sync) return false;
        const anfrage = T.abgleichAnfrage(sync, stand, config);
        const antwort = await ruf('/v1/abgleich', anfrage);
        // Während der Anfrage kann hier verkauft oder in einem zweiten Fenster gespeichert worden sein.
        nachladen();
        if (!sync || sync.code !== anfrage.code || sync.geraet !== anfrage.geraet) return false;
        const r = T.abgleichAntwort(sync, stand, config, anfrage, antwort, PREISE, Date.now());
        config = r.config;
        standSpeichern();
        configSpeichern();
        syncSpeichern();
        abgleichFehler = null;
        if (r.meldung) melden(r.meldung);
        if (!T.abgleichOffen(sync)) {
          if (!$('losDialog').open) zeichnen(); else zeichneStatus();
          return true;
        }
      }
      return false;
    } catch (e) {
      abgleichFehler = e.kurz || 'netz';
      zeichneStatus();
      return false;
    }
  }

  const MELDUNGEN = {
    geleert: 'Die gemeinsame Liste wurde für alle Geräte geleert. Lose, die dieses Gerät erst danach verkauft hat, bleiben erhalten.',
    ziehungAbgelehnt: 'Ein anderes Gerät hat inzwischen gezogen. Die Ziehung dieses Geräts wurde verworfen – es gilt die des anderen Geräts.'
  };
  function melden(art) {
    $('listenMeldungText').textContent = MELDUNGEN[art] || art;
    $('listenMeldung').hidden = false;
  }
  $('listenMeldungOk').addEventListener('click', () => { $('listenMeldung').hidden = true; });

  function zeichneStatus() {
    const leiste = $('listenStatus');
    leiste.hidden = !sync;
    $('nurHier').textContent = sync
      ? 'Dieses Gerät ist Gerät ' + sync.geraet + ' der gemeinsamen Liste. Jedes Los wird zuerst hier gespeichert und dann an die gemeinsame Liste geschickt.'
      : 'Die Lose liegen nur auf diesem Gerät. Bitte immer am selben Gerät verkaufen – ein zweites Gerät führt eine eigene Liste und zählt wieder ab Nr. 0001.';
    if (!sync) return;
    const wartend = sync.offen.lose.length;
    const zuletzt = sync.kontakt ? 'zuletzt abgeglichen um ' + uhrzeit(sync.kontakt) : 'noch nicht abgeglichen';
    let text;
    let warn = true;
    if (abgleichFehler === 'unbekannt' || abgleichFehler === 'geraet') {
      text = 'Die gemeinsame Liste kennt dieses Gerät nicht. Bitte unter Einstellungen die gemeinsame Liste verlassen und neu beitreten.';
    } else if (abgleichFehler) {
      text = 'Keine Verbindung zur gemeinsamen Liste (' + zuletzt + '). '
        + (wartend ? zahl(wartend) + (wartend === 1 ? ' Los wartet' : ' Lose warten') + ' auf diesem Gerät und ' + (wartend === 1 ? 'wird' : 'werden') + ' nachgeliefert. ' : '')
        + 'Verkaufen geht weiter.';
    } else {
      warn = false;
      text = 'Gemeinsame Liste · Gerät ' + sync.geraet + ' · ' + zuletzt;
    }
    leiste.textContent = text;
    leiste.classList.toggle('warn', warn);
  }

  function nameFragen(text, ja) {
    return new Promise((fertig) => {
      const d = $('beitrittDialog');
      $('beitrittText').textContent = text;
      $('beitrittJa').textContent = ja;
      $('beitrittName').value = '';
      d.returnValue = 'nein';
      d.addEventListener('close', () => fertig(d.returnValue === 'ja' ? $('beitrittName').value.trim() : null), { once: true });
      d.showModal();
      $('beitrittName').focus();
    });
  }

  function teamZeigen() {
    if (!sync) return;
    const link = new URL('./', location.href).href.split('#')[0] + '#team=' + sync.code;
    $('teamQr').innerHTML = QR.svg(link);
    $('teamCodeText').textContent = T.codeText(sync.code);
    $('teamDialog').showModal();
    $('teamFertig').focus();
  }
  $('teamFertig').addEventListener('click', () => $('teamDialog').close());
  $('geraetHinzu').addEventListener('click', teamZeigen);

  // neu = true legt die Liste an (dieses Gerät wird Gerät 1), sonst tritt das Gerät einer vorhandenen Liste bei.
  async function beitreten(code, neu) {
    nachladen();
    if (!ABLAGE) {
      await frage('Die gemeinsame Liste ist noch nicht eingerichtet.', 'OK');
      return;
    }
    if (sync) {
      await frage('Dieses Gerät hängt schon an einer gemeinsamen Liste. Zum Wechseln zuerst unter Einstellungen die gemeinsame Liste verlassen.', 'OK');
      return;
    }
    const n = stand.lose.length;
    if (neu && stand.lose.some((l) => l.nr > T.bereich(1)[1])) {
      await frage('Auf diesem Gerät liegen noch Lose aus einer früheren gemeinsamen Liste. Bitte zuerst eine Sicherung exportieren und dann „Alle Lose löschen“.', 'OK');
      return;
    }
    const text = neu
      ? 'Gemeinsame Liste anlegen? Dieses Gerät wird Gerät 1.' + (n ? ' Die ' + zahl(n) + (n === 1 ? ' Los' : ' Lose') + ' dieses Geräts kommen in die gemeinsame Liste.' : '')
      : 'Dieses Gerät zur gemeinsamen Liste hinzufügen?' + (n ? ' Achtung: Die ' + zahl(n) + (n === 1 ? ' Los' : ' Lose') + ', die jetzt auf diesem Gerät liegen, werden dabei gelöscht.' : '');
    const name = await nameFragen(text, neu ? 'Anlegen' : 'Beitreten');
    if (name === null) return;
    let beitritt;
    try {
      beitritt = await ruf('/v1/beitreten', { code, neu, name });
    } catch (e) {
      await frage(e.kurz === 'unbekannt'
        ? 'Diesen Team-Code kennt die gemeinsame Liste nicht. Bitte den QR-Code am anderen Gerät noch einmal scannen.'
        : 'Das hat nicht geklappt. Bitte die Internet-Verbindung prüfen und noch einmal versuchen.', 'OK');
      return;
    }
    nachladen();
    if (!neu) stand = T.leererStand();
    sync = T.abgleichNeu(code, beitritt, stand, neu);
    standSpeichern();
    syncSpeichern();
    abgleichFehler = null;
    zeichnen();
    await abgleichen();
    if (neu) teamZeigen();
  }

  $('listeAnlegen').addEventListener('click', () => beitreten(T.teamCode(rand01), true));
  $('listeBeitreten').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = T.codeLesen($('fTeamCode').value);
    if (!code) {
      await frage('Der Team-Code hat 16 Zeichen. Bitte noch einmal vom anderen Gerät abschreiben oder dort den QR-Code scannen.', 'OK');
      return;
    }
    $('fTeamCode').value = '';
    beitreten(code, false);
  });

  $('listeVerlassen').addEventListener('click', async () => {
    await abgleichen();
    nachladen();
    if (!sync) return;
    const wartend = sync.offen.lose.length;
    const text = (wartend ? 'Achtung: ' + zahl(wartend) + (wartend === 1 ? ' Los ist' : ' Lose sind') + ' noch nicht in der gemeinsamen Liste angekommen. ' : '')
      + 'Gemeinsame Liste verlassen? Die Lose bleiben auf diesem Gerät und in der gemeinsamen Liste. Danach verkauft dieses Gerät wieder nur für sich.';
    if (!await frage(text, 'Verlassen')) return;
    nachladen();
    sync = null;
    syncSpeichern();
    abgleichFehler = null;
    zeichnen();
  });

  async function fuerAlleLeeren() {
    const text = 'Wirklich alle ' + zahl(stand.lose.length) + ' Lose und die Ziehung löschen – auf ALLEN Geräten der gemeinsamen Liste? Die Zählung beginnt überall neu.';
    if (!await frage(text, 'Für alle löschen')) return;
    try {
      const r = await ruf('/v1/leeren', { code: sync.code, geraet: sync.geraet, epoche: sync.epoche });
      nachladen();
      if (!sync) return;
      T.abgleichGeleert(sync, stand, r.epoche);
      standSpeichern();
      syncSpeichern();
      zeichnen();
    } catch (e) {
      if (e.kurz !== 'veraltet') {
        await frage('Das Leeren hat nicht geklappt. Dafür braucht dieses Gerät Verbindung zur gemeinsamen Liste.', 'OK');
        return;
      }
    }
    abgleichen();
  }

  function zeichneListe() {
    $('listeNeu').hidden = !ABLAGE || !!sync;
    $('listeBeitreten').hidden = !ABLAGE || !!sync;
    $('listeDabei').hidden = !sync;
    $('listeText').textContent = !ABLAGE
      ? 'Die gemeinsame Liste für mehrere Verkaufsgeräte ist noch nicht eingerichtet. Bis dahin bitte nur an einem Gerät verkaufen.'
      : sync
        ? 'Dieses Gerät ist Gerät ' + sync.geraet + (sync.name ? ' („' + sync.name + '“)' : '') + ' der gemeinsamen Liste. Seine Losnummern beginnen bei '
          + T.nrText(T.bereich(sync.geraet)[0]) + '. Preis, Quoten und Töpfe gelten für alle Geräte gemeinsam.'
        : 'Sollen mehrere Geräte verkaufen, legt das erste eine gemeinsame Liste an. Jedes weitere Gerät scannt dort den QR-Code unter „Gerät hinzufügen“ oder tippt hier den Team-Code ein.';
    $('loeschenText').textContent = sync
      ? 'Löscht alle verkauften Lose und die Ziehung auf allen Geräten der gemeinsamen Liste. Die Einstellungen bleiben.'
      : 'Löscht alle verkauften Lose und die Ziehung auf diesem Gerät. Die Einstellungen bleiben.';
  }

  // Ein neues Gerät scannt den QR-Code "Gerät hinzufügen": Die Adresse endet dann auf #team=…
  function beitrittAusAdresse() {
    const m = /^#team=(.+)$/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);   // der Code soll nicht in der Adresszeile stehen bleiben
    const code = T.codeLesen(decodeURIComponent(m[1]));
    if (code) beitreten(code, false);
  }

  function zeichnen() {
    zeichneStatus();
    zeichneHinweis();
    if (!$('verkauf').hidden) zeichneVerkauf();
    if (!$('ziehung').hidden) zeichneZiehung();
    if (!$('einstellungen').hidden) { zeichneEinstellungen(); zeichneListe(); }
  }

  $('titel').textContent = DATEN.titel;
  $('speicherWarnung').hidden = speicherOk;
  zeichnen();
  setInterval(zeichneHinweis, 60000);

  // Gemeinsame Liste: gleich beim Öffnen, dann alle 15 Sekunden, solange die App sichtbar ist,
  // und sofort, wenn die Verbindung zurückkommt.
  abgleichen();
  setInterval(() => { if (!document.hidden) abgleichen(); }, 15000);
  window.addEventListener('online', () => abgleichen());
  window.addEventListener('hashchange', beitrittAusAdresse);
  beitrittAusAdresse();

  // Ohne Internet starten: nur auf https oder localhost möglich.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
