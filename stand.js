// Stand-App: Verkauf, Ziehung, Einstellungen. Alles liegt im Speicher dieses Geräts.
(function () {
  const T = window.Tombola;
  const DATEN = window.TOMBOLA_DATEN;
  const PREISE = DATEN.preise;
  const LS_CONFIG = 'tombola.config.v1';
  const LS_STAND = 'tombola.stand.v1';

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
      d.showModal();
      $('frageNein').focus();
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
    const los = T.verkaufen(stand, config, PREISE, rand01, Date.now());
    standSpeichern();
    zeigeLos(los);   // Die Listen dahinter werden erst nach dem Schließen neu gezeichnet – sonst verraten sie das Ergebnis.
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
    T.stornieren(stand, los.nr);
    standSpeichern();
    $('losDialog').close();
    zeichnen();
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
  function zeichneZiehung() {
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
            T.neuZiehen(stand, p, nr, rand01);
            standSpeichern();
            zeichnen();
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
          T.ziehen(stand, p, rand01);
          standSpeichern();
          zeichnen();
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
    config = T.configPruefen({ ...config, abholfrist: e.target.value }, PREISE);
    configSpeichern();
  });
  $('gewinnerLaden').addEventListener('click', () => {
    herunterladen('gewinner.json', T.gewinnerDatei(stand, config, PREISE, Date.now()));
  });

  $('pruefForm').addEventListener('submit', (e) => {
    e.preventDefault();
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
  function configAusFormular() {
    const gewichte = {};
    PREISE.forEach((p) => { gewichte[p.id] = $('gew-' + p.id).value; });
    config = T.configPruefen({
      ...config,
      preis: $('fPreis').value,
      quoteGluehwein: $('fGluehwein').value,
      quoteBier: $('fBier').value,
      quoteTopf: $('fTopf').value,
      losSeite: $('fLosSeite').value,
      gewichte
    }, PREISE);
    configSpeichern();
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
    let neu;
    try {
      neu = T.sicherungLesen(JSON.parse(await datei.text()), PREISE);
    } catch (err) {
      await frage(err instanceof SyntaxError ? 'Die Datei lässt sich nicht lesen.' : err.message, 'OK');
      return;
    }
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

  function zeichnen() {
    zeichneHinweis();
    if (!$('verkauf').hidden) zeichneVerkauf();
    if (!$('ziehung').hidden) zeichneZiehung();
    if (!$('einstellungen').hidden) zeichneEinstellungen();
  }

  $('titel').textContent = DATEN.titel;
  $('speicherWarnung').hidden = speicherOk;
  zeichnen();
  setInterval(zeichneHinweis, 60000);

  // Ohne Internet starten: nur auf https oder localhost möglich.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
