// Stand-App: Verkauf, Ziehung, Einstellungen. Alles liegt im Speicher dieses Geräts.
(function () {
  // Die Stand-App läuft nie eingebettet in einer fremden Seite – dort könnte jemand Tipper auf ihre Knöpfe lenken.
  if (window.top !== window.self) {
    document.body.textContent = 'Die Stand-App lässt sich nicht in andere Seiten einbetten. Bitte direkt öffnen.';
    return;
  }
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
  // "kaputt" merkt sich, was sich zuletzt nicht speichern ließ (Speicher voll, privater Modus).
  // Solange etwas darin steht, gilt, was dieses Fenster im Kopf hat – der ältere Stand im Gerät würde neue Lose überschreiben.
  const kaputt = new Set();
  try {
    localStorage.setItem('tombola.test', '1');
    localStorage.removeItem('tombola.test');
  } catch (e) { kaputt.add('tombola.test'); }
  const speicherOk = () => kaputt.size === 0;

  function lesen(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function schreiben(key, wert) {
    const vorher = speicherOk();
    let ok = true;
    try {
      localStorage.setItem(key, JSON.stringify(wert));
      kaputt.delete(key);
      kaputt.delete('tombola.test');
    } catch (e) {
      ok = false;
      kaputt.add(key);
    }
    $('speicherWarnung').hidden = speicherOk();
    if (vorher && !ok) speicherAlarm();
    return ok;
  }
  // Einmal deutlich sagen, sobald das Speichern ausfällt – die Leiste oben übersieht man im Verkauf leicht.
  function speicherAlarm() {
    setTimeout(() => {
      if ($('frageDialog').open) return;
      frage('Achtung: Dieses Gerät kann gerade nicht speichern (Speicher voll oder privater Modus). '
        + 'Was ab jetzt verkauft wird, geht beim Schließen der App verloren'
        + (sync ? ', sobald es nicht in der gemeinsamen Liste angekommen ist' : '')
        + '. Bitte jetzt oben auf „Jetzt sichern“ tippen und an diesem Gerät nicht weiterverkaufen.', 'OK');
    }, 0);
  }

  let config = T.configPruefen(lesen(LS_CONFIG), PREISE);
  let stand = T.standPruefen(lesen(LS_STAND));
  const standSpeichern = () => schreiben(LS_STAND, stand);
  const configSpeichern = () => schreiben(LS_CONFIG, config);

  // Merkzettel für die gemeinsame Liste mehrerer Geräte; null = dieses Gerät verkauft nur für sich.
  function syncLesen() {
    const s = lesen(LS_SYNC);
    if (!s || typeof s !== 'object' || !s.code || !s.geraet || !s.offen) return null;
    if (!Array.isArray(s.offen.aus)) s.offen.aus = [];   // Merkzettel aus einer älteren Fassung der App
    return s;
  }
  let sync = syncLesen();
  // Lose und Merkzettel gehören zusammen: Der Merkzettel sagt, was die gemeinsame Liste schon geliefert hat.
  // Lässt sich die Liste nicht speichern, bleibt auch der alte Merkzettel im Gerät stehen – sonst würden nach einem
  // Neustart Lose der anderen Geräte fehlen, ohne dass die App sie noch einmal holt.
  function syncSpeichern() {
    if (kaputt.has(LS_STAND)) { kaputt.add(LS_SYNC); return false; }
    if (sync) return schreiben(LS_SYNC, sync);
    try { localStorage.removeItem(LS_SYNC); kaputt.delete(LS_SYNC); } catch (e) { /* privater Modus */ }
    $('speicherWarnung').hidden = speicherOk();
    return true;
  }
  function standUndSyncSpeichern() {
    standSpeichern();
    return syncSpeichern();
  }

  // Maßgeblich ist der Speicher des Geräts, nicht dieses Fenster. Ist die App ein zweites Mal offen
  // (zweiter Tab, ein Fenster von gestern), hat das andere Fenster vielleicht inzwischen verkauft.
  // Darum vor jeder Änderung neu lesen – sonst überschreibt ein altes Fenster die Lose des anderen.
  function nachladen() {
    if (kaputt.has('tombola.test')) return;   // dieses Gerät speichert gar nichts
    if (!kaputt.has(LS_STAND)) {
      const s = lesen(LS_STAND);
      if (s) stand = T.standPruefen(s);
    }
    if (!kaputt.has(LS_CONFIG)) {
      const c = lesen(LS_CONFIG);
      if (c) config = T.configPruefen(c, PREISE);
    }
    if (!kaputt.has(LS_SYNC) && !kaputt.has(LS_STAND)) sync = syncLesen();
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
    reiter.forEach((b) => {
      const an = b.dataset.ansicht === ansicht;
      b.setAttribute('aria-selected', String(an));
      b.tabIndex = an ? 0 : -1;
    });
    ['verkauf', 'ziehung', 'einstellungen'].forEach((id) => { $(id).hidden = id !== ansicht; });
    zeichnen();
  }
  reiter.forEach((b) => b.addEventListener('click', () => zeige(b.dataset.ansicht)));
  // Mit den Pfeiltasten von Reiter zu Reiter, wie bei Reitern üblich.
  document.querySelector('.reiter').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = reiter.indexOf(document.activeElement);
    if (i < 0) return;
    const ziel = reiter[(i + (e.key === 'ArrowRight' ? 1 : reiter.length - 1)) % reiter.length];
    ziel.focus();
    zeige(ziel.dataset.ansicht);
    e.preventDefault();
  });

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
    standUndSyncSpeichern();
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
    $('dAus').hidden = true;
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
      feld.replaceChildren(el('span', 'block', 'Glühwein'),
        el('small', '', los.aus ? 'Schon ausgegeben um ' + uhrzeit(los.aus) + '.' : 'Jetzt einen Glühwein ausschenken.'));
    } else if (los.erg === T.BIER) {
      feld.replaceChildren(el('span', 'block', 'Schnaitl'),
        el('small', '', los.aus ? 'Schon ausgegeben um ' + uhrzeit(los.aus) + '.' : 'Jetzt ein Schnaitl (0,3 l) ausgeben.'));
    } else {
      feld.replaceChildren(el('small', '', 'Im Lostopf für'), el('span', 'block', p.name), el('small', '', 'Losnummer und Prüfcode mitgeben.'));
    }
    $('dCode').textContent = 'Prüfcode ' + los.pruef;
    // Nach dem Ausschenken vermerken – dann fällt auf, wenn dasselbe Los später noch einmal gezeigt wird.
    $('dAus').hidden = !((los.erg === T.GLUEHWEIN || los.erg === T.BIER) && !los.aus && !los.storno);
  });

  // Vermerkt die Ausgabe auf diesem Gerät und schickt sie an die gemeinsame Liste. Gibt das Los zurück.
  function ausgegeben(nr) {
    nachladen();
    if (T.ausgeben(stand, nr, Date.now()) && sync) T.abgleichVormerken(sync, { aus: nr });
    standUndSyncSpeichern();
    abgleichen();
    return stand.lose.find((l) => l.nr === nr);
  }
  $('dAus').addEventListener('click', () => {
    if (!offenesLos) return;
    const los = ausgegeben(offenesLos.nr);
    if (!los) return;
    offenesLos = los;
    $('dAus').hidden = true;
    const klein = $('dErgebnis').querySelector('small');
    if (klein && los.aus) klein.textContent = 'Ausgegeben um ' + uhrzeit(los.aus) + '.';
    $('dFertig').focus();
  });

  $('dFertig').addEventListener('click', () => $('losDialog').close());
  $('dStorno').addEventListener('click', async () => {
    const los = offenesLos;
    if (!los) return;
    if (!await frage('Los Nr. ' + T.nrText(los.nr) + ' stornieren? Es zählt dann nicht mehr und nimmt an keiner Ziehung teil.', 'Stornieren')) return;
    nachladen();
    if (PREISE.some((p) => T.gezogene(stand, p.id).includes(los.nr))) {
      await frage('Los Nr. ' + T.nrText(los.nr) + ' wurde schon gezogen und lässt sich nicht mehr stornieren. '
        + 'Soll der Preis neu vergeben werden, unter „Ziehung“ auf „Neu ziehen“ tippen.', 'OK');
      return;
    }
    if (T.stornieren(stand, los.nr) && sync) T.abgleichVormerken(sync, { storno: los.nr });
    standUndSyncSpeichern();
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
    $('letzteHinweis').hidden = !letzte.some((los) => !los.storno);
    if (!letzte.length) {
      liste.replaceChildren(el('li', 'leer', 'Noch kein Los verkauft.'));
      return;
    }
    liste.replaceChildren(...letzte.map((los) => {
      const li = el('li', los.storno ? 'storno' : '');
      const teile = [
        el('span', 'nr ziffern', 'Nr. ' + T.nrText(los.nr)),
        el('span', 'zeit ziffern', uhrzeit(los.t)),
        el('span', 'erg' + ((los.erg === T.GLUEHWEIN || los.erg === T.BIER) && !los.storno ? ' marke-g' : ''), ergebnisText(los.erg) + (los.storno ? ' (storniert)' : los.aus ? ' · ausgegeben' : ''))
      ];
      if (los.storno) {
        li.append(...teile);
      } else {
        // Antippen zeigt QR-Code und Storno noch einmal – falls der Kunde nicht gescannt hat oder das Fenster zu früh zu war.
        const knopf = el('button', 'eintrag');
        knopf.type = 'button';
        knopf.setAttribute('aria-label', 'Los Nr. ' + T.nrText(los.nr) + ' noch einmal zeigen');
        knopf.append(...teile);
        knopf.addEventListener('click', () => zeigeLos(los));
        li.append(knopf);
      }
      return li;
    }));
  }

  // ---------- Ton für die Ziehung ----------
  // Trommelwirbel und Tusch entstehen im Gerät selbst (Web Audio) – es braucht keine Tondatei.
  // Am iPhone bleibt es still, solange der Stummschalter an der Seite an ist.
  const ton = (() => {
    let ac = null;
    let aus = null;
    let rauschen = null;
    let wirbel = null;        // { gain, takt }

    // Muss direkt auf einen Fingertipp hin aufgerufen werden, sonst gibt der Browser den Ton nicht frei.
    function bereit() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ac = new AC();
        const druck = ac.createDynamicsCompressor();
        druck.threshold.value = -12;
        druck.ratio.value = 6;
        aus = ac.createGain();
        aus.gain.value = 0.9;
        aus.connect(druck);
        druck.connect(ac.destination);
        rauschen = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = rauschen.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
      return true;
    }

    // Ein Schlag auf die kleine Trommel: kurzes Rauschen für das Fell, ein tiefer Ton für den Kessel.
    function schlag(t, staerke, ziel) {
      const q = ac.createBufferSource();
      q.buffer = rauschen;
      q.playbackRate.value = 0.9 + Math.random() * 0.3;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2300;
      f.Q.value = 0.6;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(staerke, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.095);
      q.connect(f);
      f.connect(g);
      g.connect(ziel);
      q.start(t, Math.random() * 0.5, 0.12);
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(215, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.05);
      const og = ac.createGain();
      og.gain.setValueAtTime(staerke * 0.45, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(og);
      og.connect(ziel);
      o.start(t);
      o.stop(t + 0.08);
    }

    // Der Wirbel wird in den ersten Sekunden lauter und hält dann an, bis wirbelStopp() kommt.
    function wirbelStart() {
      if (!bereit()) return;
      wirbelStopp();
      const gain = ac.createGain();
      const jetzt = ac.currentTime;
      gain.gain.setValueAtTime(0.38, jetzt);
      gain.gain.linearRampToValueAtTime(1, jetzt + 6);
      gain.connect(aus);
      let naechster = jetzt + 0.05;
      let n = 0;
      const planen = () => {
        while (naechster < ac.currentTime + 0.18) {
          schlag(naechster, (n % 4 === 0 ? 0.9 : 0.55) + Math.random() * 0.1, gain);
          naechster += (1 / 27) * (0.92 + Math.random() * 0.16);
          n++;
        }
      };
      planen();
      wirbel = { gain, takt: setInterval(planen, 40) };
    }

    function wirbelStopp() {
      if (!wirbel) return;
      clearInterval(wirbel.takt);
      const g = wirbel.gain;
      g.gain.cancelScheduledValues(ac.currentTime);
      g.gain.setValueAtTime(g.gain.value, ac.currentTime);
      g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.04);
      setTimeout(() => g.disconnect(), 400);
      wirbel = null;
    }

    // Tusch: Paukenschlag, Becken und ein kurzer, dann ein langer Bläser-Akkord ("Ta-daa").
    function tusch() {
      if (!bereit()) return;
      const t = ac.currentTime + 0.02;
      schlag(t, 0.8, aus);
      const pauke = ac.createOscillator();
      pauke.frequency.setValueAtTime(150, t);
      pauke.frequency.exponentialRampToValueAtTime(45, t + 0.3);
      const pg = ac.createGain();
      pg.gain.setValueAtTime(0.75, t);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      pauke.connect(pg);
      pg.connect(aus);
      pauke.start(t);
      pauke.stop(t + 0.5);

      const becken = ac.createBufferSource();
      becken.buffer = rauschen;
      becken.loop = true;
      const hoch = ac.createBiquadFilter();
      hoch.type = 'highpass';
      hoch.frequency.value = 5200;
      const bg = ac.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.55, t + 0.01);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      becken.connect(hoch);
      hoch.connect(bg);
      bg.connect(aus);
      becken.start(t);
      becken.stop(t + 2);

      const akkord = (start, dauer, laut) => {
        const tief = ac.createBiquadFilter();
        tief.type = 'lowpass';
        tief.frequency.setValueAtTime(2600, start);
        tief.frequency.exponentialRampToValueAtTime(1200, start + dauer);
        const ag = ac.createGain();
        ag.gain.setValueAtTime(0.0001, start);
        ag.gain.exponentialRampToValueAtTime(laut, start + 0.025);
        ag.gain.setValueAtTime(laut, start + dauer * 0.55);
        ag.gain.exponentialRampToValueAtTime(0.0001, start + dauer);
        tief.connect(ag);
        ag.connect(aus);
        [261.63, 329.63, 392.0, 523.25].forEach((hz, i) => {
          const o = ac.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = hz;
          o.detune.value = (i % 2 ? 6 : -6);
          o.connect(tief);
          o.start(start);
          o.stop(start + dauer + 0.05);
        });
      };
      akkord(t, 0.14, 0.1);
      akkord(t + 0.19, 1.25, 0.13);
    }

    return { bereit, wirbelStart, wirbelStopp, tusch };
  })();

  $('tonTest').addEventListener('click', () => {
    if (!ton.bereit()) {
      frage('Dieses Gerät kann den Ton für die Ziehung nicht abspielen.', 'OK');
      return;
    }
    ton.wirbelStart();
    setTimeout(() => { ton.wirbelStopp(); ton.tusch(); }, 2500);
  });

  // ---------- Ziehung als Auftritt ----------
  // Das Los ist da schon gezogen und gespeichert. Die Zahlen rollen nur für die Spannung,
  // bis jemand "Aufdecken" antippt – dann steht die gezogene Nummer da.
  let ziehRollen = null;
  function ziehShow(p, nr, imTopf, wievielte) {
    const d = $('ziehDialog');
    const zahlFeld = $('ziehZahl');
    $('ziehDach').textContent = p.ziehungen > 1 ? 'Ziehung ' + wievielte + ' von ' + p.ziehungen : 'Ziehung';
    $('ziehPreis').textContent = p.name;
    $('ziehUnter').textContent = zahl(imTopf) + (imTopf === 1 ? ' Los' : ' Lose') + ' im Topf';
    $('ziehAufdecken').hidden = false;
    $('ziehFertig').hidden = true;
    // Gezeigt werden beim Rollen echte Losnummern aus dem Verkauf – bei wenigen Losen aufgefüllt, damit es nichts verrät.
    const vorrat = stand.lose.filter((l) => !l.storno).map((l) => l.nr);
    const hoechste = vorrat.reduce((m, n) => Math.max(m, n), 30);
    while (vorrat.length < 12) vorrat.push(1 + Math.floor(Math.random() * hoechste));
    zahlFeld.className = 'zieh-zahl ziffern rollt';
    clearInterval(ziehRollen);
    ziehRollen = setInterval(() => {
      zahlFeld.textContent = T.nrText(vorrat[Math.floor(Math.random() * vorrat.length)]);
    }, 70);
    zahlFeld.textContent = T.nrText(vorrat[0]);
    d.dataset.nr = String(nr);
    if (!d.open) d.showModal();
    $('ziehAufdecken').focus();
    ton.wirbelStart();
  }
  $('ziehAufdecken').addEventListener('click', () => {
    clearInterval(ziehRollen);
    ziehRollen = null;
    ton.wirbelStopp();
    ton.tusch();
    const zahlFeld = $('ziehZahl');
    zahlFeld.textContent = T.nrText(Number($('ziehDialog').dataset.nr));
    zahlFeld.className = 'zieh-zahl ziffern steht';
    $('ziehUnter').textContent = 'Herzlichen Glückwunsch!';
    $('ziehAufdecken').hidden = true;
    $('ziehFertig').hidden = false;
    $('ziehFertig').focus();
  });
  $('ziehFertig').addEventListener('click', () => $('ziehDialog').close());
  // Solange die Zahlen rollen, lässt sich der Auftritt nicht mit "Esc" wegdrücken.
  $('ziehDialog').addEventListener('cancel', (e) => { if (ziehRollen) e.preventDefault(); });
  $('ziehDialog').addEventListener('close', () => { clearInterval(ziehRollen); ziehRollen = null; ton.wirbelStopp(); });

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
    standUndSyncSpeichern();
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
      const spaet = g.nr !== sync.geraet && !g.weg && jetzt - g.kontakt > 5 * 60 * 1000;
      li.append(
        el('span', 'geraet', 'Gerät ' + g.nr + (g.name && g.name !== 'Gerät ' + g.nr ? ' · ' + g.name : '') + (g.nr === sync.geraet ? ' (dieses Gerät)' : '')),
        el('span', 'ziffern', zahl(g.lose) + (g.lose === 1 ? ' Los' : ' Lose')),
        el('span', spaet || g.weg ? 'spaet' : 'matt', g.weg ? 'entfernt' : g.kontakt ? (spaet ? 'zuletzt gemeldet ' : 'gemeldet ') + uhrzeit(g.kontakt) : 'noch nicht gemeldet')
      );
      return li;
    }));
  }

  function zeichneZiehung() {
    zeichneGeraete();
    $('toepfe').replaceChildren(...PREISE.map((p) => {
      const karte = el('article', 'topf');
      const gezogen = T.gezogene(stand, p.id);
      // Ein gezogenes Los kann storniert sein, wenn ein Gerät storniert hat, bevor es von der Ziehung wusste. Es zählt dann nicht.
      const storniert = T.stornoGezogen(stand, p.id);
      const gueltig = gezogen.length - storniert.length;
      const rest = T.imTopf(stand, p.id).length;
      karte.append(el('h3', '', p.name));
      karte.append(el('div', 'matt', zahl(rest) + (rest === 1 ? ' Los' : ' Lose') + ' im Topf · ' + gueltig + ' von ' + p.ziehungen + ' gezogen'));
      if (storniert.length) {
        karte.append(el('div', 'ergebnis-zeile schlecht', (storniert.length === 1 ? 'Ein gezogenes Los wurde' : storniert.length + ' gezogene Lose wurden')
          + ' storniert und ' + (storniert.length === 1 ? 'zählt' : 'zählen') + ' nicht als Gewinn.'
          + (rest ? ' Bitte noch einmal ziehen.' : ' Im Topf liegt kein weiteres Los.')));
      }

      if (gezogen.length) {
        const ul = el('ul', 'gezogen');
        gezogen.forEach((nr) => {
          const li = el('li');
          if (storniert.includes(nr)) {
            li.append(el('span', 'nummer ziffern', 'Nr. ' + T.nrText(nr)), el('span', 'spaet', 'storniert – zählt nicht'));
            ul.append(li);
            return;
          }
          const neu = el('button', 'knopf leise', 'Neu ziehen');
          neu.addEventListener('click', async () => {
            ton.bereit();   // direkt auf den Fingertipp, sonst bleibt das Gerät später stumm
            const text = 'Los Nr. ' + T.nrText(nr) + ' verfällt und es wird ein anderes gezogen. Nur verwenden, wenn der Preis nicht abgeholt wurde.';
            if (!await frage(text, 'Neu ziehen')) return;
            if (!await vorZiehung()) return;
            nachladen();
            const imTopf = T.imTopf(stand, p.id).length;
            const neueNr = T.neuZiehen(stand, p, nr, rand01);
            nachZiehung();
            if (neueNr !== null) ziehShow(p, neueNr, imTopf, T.gezogene(stand, p.id).length);
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
        knopf.textContent = p.ziehungen > 1 ? 'Ziehen (' + (gueltig + 1) + ' von ' + p.ziehungen + ')' : 'Ziehen';
        knopf.addEventListener('click', async () => {
          ton.bereit();   // direkt auf den Fingertipp, sonst bleibt das Gerät später stumm
          if (!await frage('Jetzt für „' + p.name + '“ ziehen?', 'Ziehen')) return;
          if (!await vorZiehung()) return;
          nachladen();
          const imTopf = T.imTopf(stand, p.id).length;
          const gezogeneNr = T.ziehen(stand, p, rand01);
          nachZiehung();
          if (gezogeneNr !== null) ziehShow(p, gezogeneNr, imTopf, T.gezogene(stand, p.id).length);
        });
      }
      karte.append(knopf);
      return karte;
    }));
    if (document.activeElement !== $('abholfrist')) $('abholfrist').value = config.abholfrist;
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
    zeigePruefung(T.losPruefen(stand, $('pruefNr').value.trim(), $('pruefCode').value));
  });

  const wann = (t) => new Date(t).toLocaleString('de-AT', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  let geprueft = null;   // Nummer des Loses, für das gerade "Als ausgegeben vermerken" angeboten wird

  function zeigePruefung(r) {
    const aus = $('pruefErgebnis');
    let text;
    let gut = false;
    geprueft = null;
    if (r.status === 'unbekannt') text = 'Diese Losnummer wurde hier nicht verkauft.';
    else if (r.status === 'falscherCode') text = 'Der Prüfcode passt nicht zu dieser Losnummer.';
    else if (r.status === 'storno') text = 'Dieses Los wurde storniert.';
    else if (r.los.erg === T.NIETE) text = 'Gültiges Los, aber eine Niete.';
    else if (r.gewonnen || r.los.erg === T.GLUEHWEIN || r.los.erg === T.BIER) {
      const was = r.gewonnen ? 'Gewinn: ' + preisVon(r.los.erg).name : r.los.erg === T.GLUEHWEIN ? 'ein Glühwein' : 'ein Schnaitl';
      if (r.los.aus) text = 'Achtung: Für dieses Los wurde schon ausgegeben (' + was + '), am ' + wann(r.los.aus) + ' Uhr.';
      else { text = 'Gültig – ' + was + '. Noch nicht ausgegeben.'; gut = true; geprueft = r.los.nr; }
    } else if (preisVon(r.los.erg)) text = 'Gültiges Los im Topf „' + preisVon(r.los.erg).name + '“, wurde aber nicht gezogen.';
    else text = 'Gültiges Los, aber ohne Gewinn.';
    aus.textContent = text;
    aus.className = 'ergebnis-zeile ' + (gut ? 'gut' : 'schlecht');
    aus.hidden = false;
    $('pruefAus').hidden = geprueft === null;
  }
  $('pruefAus').addEventListener('click', () => {
    if (geprueft === null) return;
    const los = ausgegeben(geprueft);
    geprueft = null;
    $('pruefAus').hidden = true;
    if (!los || !los.aus) return;
    const aus = $('pruefErgebnis');
    aus.textContent = 'Vermerkt: ausgegeben um ' + uhrzeit(los.aus) + ' Uhr (Los Nr. ' + T.nrText(los.nr) + ').';
    aus.className = 'ergebnis-zeile gut';
  });
  ['pruefNr', 'pruefCode'].forEach((id) => $(id).addEventListener('input', () => {
    geprueft = null;
    $('pruefAus').hidden = true;
    $('pruefErgebnis').hidden = true;
  }));

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
        e.status = res.status;
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
        if (!sync || sync.geraet !== anfrage.geraet || (sync.raum || sync.code) !== (anfrage.raum || anfrage.code)) return false;
        const r = T.abgleichAntwort(sync, stand, config, anfrage, antwort, PREISE, Date.now());
        config = r.config;
        configSpeichern();
        standUndSyncSpeichern();
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

  const ENTFERNT = 'Dieses Gerät wurde vom Admin aus der gemeinsamen Liste entfernt, oder der Team-Code wurde erneuert, bevor es die aktuelle App hatte.';
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
    if (abgleichFehler === 'entfernt') {
      text = ENTFERNT + ' '
        + (wartend ? zahl(wartend) + (wartend === 1 ? ' Los liegt' : ' Lose liegen') + ' nur auf diesem Gerät – bitte jetzt eine Sicherung exportieren. ' : 'Alle Lose dieses Geräts sind in der gemeinsamen Liste. ')
        + 'Zum Weiterverkaufen unter Einstellungen die gemeinsame Liste verlassen.';
    } else if (abgleichFehler === 'unbekannt' || abgleichFehler === 'geraet') {
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

  function passwortFragen(text) {
    return new Promise((fertig) => {
      const d = $('passwortDialog');
      $('passwortText').textContent = text;
      $('passwortFeld').value = '';
      d.returnValue = 'nein';
      d.addEventListener('close', () => {
        const wert = $('passwortFeld').value;
        $('passwortFeld').value = '';
        fertig(d.returnValue === 'ja' ? wert : null);
      }, { once: true });
      d.showModal();
      $('passwortFeld').focus();
    });
  }

  function teamZeigen() {
    if (!sync) return;
    if (sync.codeAlt) {
      frage('Der Team-Code wurde vom Admin erneuert. Neue Geräte fügt jetzt das Gerät hinzu, an dem er erneuert wurde – dort unter Einstellungen „Gerät hinzufügen“.', 'OK');
      return;
    }
    // Der QR-Code führt zur Tombola im Internet – auch wenn die Liste an der Testadresse am Rechner angelegt wurde.
    const link = T.teamLink(DATEN.adresse, location.href, sync.code);
    $('teamQr').innerHTML = QR.svg(link);
    $('teamAdresse').textContent = T.nurAmGeraet(link)
      ? 'Achtung: Dieser QR-Code führt auf „localhost“ und ist von Handys aus nicht erreichbar.'
      : 'Führt zu ' + link.split('#')[0];
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
    let anlegen;   // das Anlege-Passwort; gefragt wird erst, wenn die gemeinsame Liste eines verlangt
    for (;;) {
      try {
        beitritt = await ruf('/v1/beitreten', { code, neu, name, will: 'schluessel', ...(anlegen === undefined ? {} : { anlegen }) });
        break;
      } catch (e) {
        if (neu && e.kurz === 'anlegen') {
          anlegen = await passwortFragen(anlegen === undefined
            ? 'Eine neue gemeinsame Liste darf nur der Verein anlegen. Bitte das Anlege-Passwort eingeben.'
            : 'Das Passwort stimmt nicht. Bitte noch einmal eingeben.');
          if (anlegen === null) return;
          continue;
        }
        await frage(e.kurz === 'unbekannt'
          ? 'Diesen Team-Code kennt die gemeinsame Liste nicht. Bitte den QR-Code am anderen Gerät noch einmal scannen.'
          : e.kurz === 'voll' && e.status === 409
            ? 'An dieser gemeinsamen Liste hängen schon 99 Geräte. Mehr gehen nicht.'
            : e.kurz === 'voll'
              ? 'Es lässt sich gerade keine neue gemeinsame Liste anlegen, weil schon zu viele Listen bestehen. Das liegt nicht an der Verbindung – bitte bei der Person melden, die die Tombola eingerichtet hat.'
              : 'Das hat nicht geklappt. Bitte die Internet-Verbindung prüfen und noch einmal versuchen.', 'OK');
        return;
      }
    }
    nachladen();
    if (!neu) stand = T.leererStand();
    sync = T.abgleichNeu(code, beitritt, stand, neu);
    standUndSyncSpeichern();
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
      const { will, ...wer } = T.abgleichWer(sync);
      const r = await ruf('/v1/leeren', { ...wer, epoche: sync.epoche });
      nachladen();
      if (!sync) return;
      T.abgleichGeleert(sync, stand, r.epoche);
      standUndSyncSpeichern();
      zeichnen();
    } catch (e) {
      if (e.kurz !== 'veraltet') {
        await frage(e.kurz === 'entfernt' ? ENTFERNT + ' Es kann die gemeinsame Liste nicht mehr leeren.'
          : 'Das Leeren hat nicht geklappt. Dafür braucht dieses Gerät Verbindung zur gemeinsamen Liste.', 'OK');
        return;
      }
    }
    abgleichen();
  }

  // ---------- Verwalten (Admin): Gerät entfernen, Team-Code erneuern ----------
  // Braucht das Anlege-Passwort. Es bleibt nur im Kopf dieses Fensters, solange der Admin-Bereich offen ist.
  let adminPasswort = null;

  async function adminRuf(mehr) {
    const { will, ...wer } = T.abgleichWer(sync);
    return ruf('/v1/verwalten', { ...wer, anlegen: adminPasswort, ...mehr });
  }
  const ADMIN_FEHLER = {
    keinAdmin: 'Verwalten geht erst, wenn für die gemeinsame Liste ein Anlege-Passwort hinterlegt ist.',
    alt: 'Dieses Gerät hat noch keinen eigenen Schlüssel von der gemeinsamen Liste bekommen. Bitte kurz warten, bis oben „zuletzt abgeglichen“ steht, und noch einmal versuchen.',
    entfernt: ENTFERNT,
    code: 'Der neue Team-Code ließ sich nicht vergeben. Bitte noch einmal versuchen.'
  };
  const adminFehlerText = (e) => ADMIN_FEHLER[e.kurz] || 'Das hat nicht geklappt. Bitte die Internet-Verbindung prüfen und noch einmal versuchen.';

  function zeichneAdmin(geraete) {
    $('adminListe').replaceChildren(...geraete.map((g) => {
      const li = el('li');
      const eigen = g.nr === sync.geraet;
      const name = 'Gerät ' + g.nr + (g.name && g.name !== 'Gerät ' + g.nr ? ' · ' + g.name : '');
      li.append(
        el('span', 'geraet', name + (eigen ? ' (dieses Gerät)' : '')),
        el('span', 'ziffern', zahl(g.lose) + (g.lose === 1 ? ' Los' : ' Lose')),
        el('span', g.weg || g.alt ? 'spaet' : 'matt', g.weg ? 'entfernt' : g.alt ? 'ältere App – fliegt beim Erneuern des Codes hinaus' : g.kontakt ? 'gemeldet ' + uhrzeit(g.kontakt) : 'noch nicht gemeldet')
      );
      if (!eigen && !g.weg) {
        const weg = el('button', 'knopf leise gefahr', 'Entfernen');
        weg.type = 'button';
        weg.setAttribute('aria-label', name + ' entfernen');
        weg.addEventListener('click', () => adminAendern('entfernen', g, name));
        li.append(weg);
      }
      return li;
    }));
  }

  // Entfernt ein Gerät oder erneuert nur den Team-Code. Beides vergibt einen neuen Code; die Lose bleiben, wo sie sind.
  async function adminAendern(aktion, g, name) {
    const text = aktion === 'entfernen'
      ? name + ' aus der gemeinsamen Liste entfernen? Es kann danach nichts mehr abgeben oder abholen. '
        + 'Die Lose, die es schon abgegeben hat (' + zahl(g.lose) + '), bleiben in der Liste. '
        + 'Dabei wird auch der Team-Code erneuert – neue Geräte kommen nur noch mit dem neuen Code herein.'
      : 'Team-Code erneuern? Mit dem bisherigen Code kann danach niemand mehr beitreten. '
        + 'Geräte, die schon dabei sind, verkaufen weiter; alle Lose bleiben. Neue Geräte fügst du danach an diesem Gerät hinzu.';
    if (!await frage(text, aktion === 'entfernen' ? 'Entfernen' : 'Erneuern')) return;
    nachladen();
    if (!sync) return;
    const neuerCode = T.teamCode(rand01);
    let r;
    try {
      r = await adminRuf(aktion === 'entfernen' ? { aktion, ziel: g.nr, neuerCode } : { aktion: 'code', neuerCode });
    } catch (e) {
      await frage(adminFehlerText(e), 'OK');
      return;
    }
    nachladen();
    if (!sync) return;
    T.abgleichCodeNeu(sync, neuerCode, r.codeV);
    sync.geraete = r.geraete;
    syncSpeichern();
    zeichneAdmin(r.geraete);
    zeichnen();
    await frage((aktion === 'entfernen' ? name + ' ist entfernt. ' : '') + 'Der neue Team-Code gilt ab sofort. Unter „Gerät hinzufügen“ zeigt dieses Gerät ihn an.', 'OK');
  }

  $('verwalten').addEventListener('click', async () => {
    nachladen();
    if (!sync) return;
    let text = 'Admin-Bereich: Geräte entfernen oder den Team-Code erneuern. Bitte das Anlege-Passwort eingeben.';
    for (;;) {
      adminPasswort = await passwortFragen(text);
      if (adminPasswort === null) return;
      try {
        const r = await adminRuf({ aktion: 'pruefen' });
        zeichneAdmin(r.geraete);
        break;
      } catch (e) {
        if (e.kurz === 'anlegen') { text = 'Das Passwort stimmt nicht. Bitte noch einmal eingeben.'; continue; }
        adminPasswort = null;
        await frage(adminFehlerText(e), 'OK');
        return;
      }
    }
    $('adminDialog').showModal();
    $('adminFertig').focus();
  });
  $('adminCode').addEventListener('click', () => adminAendern('code'));
  $('adminFertig').addEventListener('click', () => $('adminDialog').close());
  $('adminDialog').addEventListener('close', () => { adminPasswort = null; $('adminListe').replaceChildren(); });

  function zeichneListe() {
    $('listeNeu').hidden = !ABLAGE || !!sync;
    $('listeBeitreten').hidden = !ABLAGE || !!sync;
    $('listeDabei').hidden = !sync;
    $('listeText').textContent = !ABLAGE
      ? 'Die gemeinsame Liste für mehrere Verkaufsgeräte ist noch nicht eingerichtet. Bis dahin bitte nur an einem Gerät verkaufen.'
      : sync
        ? 'Dieses Gerät ist Gerät ' + sync.geraet + (sync.name ? ' („' + sync.name + '“)' : '') + ' der gemeinsamen Liste. Seine Losnummern beginnen bei '
          + T.nrText(T.bereich(sync.geraet)[0]) + '. Preis, Quoten und Töpfe gelten für alle Geräte gemeinsam.'
        : 'Sollen mehrere Geräte verkaufen, tippt das erste auf „Mit mehreren Geräten verkaufen“. Es legt damit eine gemeinsame Liste an und zeigt einen QR-Code. Jedes weitere Gerät scannt ihn oder tippt hier den Team-Code ein.';
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
  // Unter "localhost" läuft nur die Testfassung am Rechner. Wer hier verkauft, bekommt QR-Codes, die kein Handy öffnen kann.
  if (T.nurAmGeraet(location.href)) {
    $('testHinweisText').textContent = 'Das ist die Testfassung am Rechner. Lose von hier lassen sich am Handy nicht öffnen.'
      + (DATEN.adresse ? ' Die echte Tombola läuft unter ' + DATEN.adresse : '');
    $('testHinweis').hidden = false;
  }
  $('speicherWarnung').hidden = speicherOk();
  // Den Browser bitten, die Daten dieser Seite nicht von sich aus wegzuräumen, wenn der Gerätespeicher knapp wird.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
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
