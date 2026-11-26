// Los-Seite fürs Kundenhandy: liest das Los aus dem Link, lässt es aufrubbeln
// und zeigt nach der Ziehung, ob die Nummer gezogen wurde.
(function () {
  const T = window.Tombola;
  const DATEN = window.TOMBOLA_DATEN;
  const PREISE = DATEN.preise;
  const $ = (id) => document.getElementById(id);
  const el = (tag, klasse, text) => {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Wer ein zweites Los scannt, landet oft im selben Tab – dort ändert sich nur der Teil nach dem #.
  // Ohne Neuladen bliebe das alte Los stehen.
  window.addEventListener('hashchange', () => location.reload());

  // Legt die Seite im Handy ab, damit ein schon geöffnetes Los auch ohne Empfang wieder aufgeht.
  // Das geht nur unter einer https-Adresse.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  $('titel').textContent = DATEN.titel;
  $('verein').textContent = DATEN.verein || '';
  const los = T.linkLesen(location.hash, PREISE);
  if (!los) {
    $('fehler').hidden = false;
    return;
  }

  const nr = 'Nr. ' + T.nrText(los.nr);
  const preis = PREISE.find((p) => p.id === los.erg);
  const merkKey = 'tombola.los.' + los.nr + '-' + los.pruef;
  const gemerkt = (() => { try { return localStorage.getItem(merkKey); } catch (e) { return null; } })();
  const merken = (status) => { try { localStorage.setItem(merkKey, status); } catch (e) { /* privater Modus */ } };

  document.title = 'Los ' + nr + ' – ' + DATEN.titel;
  $('nr').textContent = nr;
  $('fussNr').textContent = 'Los ' + nr;
  $('pruef').textContent = los.pruef;
  $('karte').hidden = false;

  // ---------- Inhalte je nach Ergebnis ----------
  // "stufe" legt fest, wie groß nach dem Rubbeln gefeiert wird:
  // still (Niete), klein (Glühwein, Schnaitl), gross (im Lostopf), haupt (bei der Ziehung gezogen).
  // "motiv" ist eine Zeichnung aus motive/*.svg, "bild" ein Foto.
  function inhalt(status, datei) {
    const frist = datei && datei.abholfrist ? ' Abholung: ' + datei.abholfrist + '.' : '';
    if (status === 'niete') {
      return {
        motiv: 'tanne', stufe: 'still', dach: 'Leider', gross: 'Niete',
        text: ['Diesmal war nichts dabei. Danke fürs Mitmachen – mit deinem Los unterstützt du den Verein.']
      };
    }
    if (status === 'gluehwein') {
      return {
        motiv: 'tasse', stufe: 'klein', gewinn: true, dach: 'Gewonnen', gross: 'Ein Glühwein',
        text: ['Der geht aufs Haus. Hol ihn dir gleich am Stand.',
          'Zeig dort dieses Los. Wir prüfen die Losnummer ' + T.nrText(los.nr) + ' und den Prüfcode ' + los.pruef + '.']
      };
    }
    if (status === 'bier') {
      return {
        bild: 'schnaitl.jpg', bildText: 'Flasche Schnaitl Pils', stufe: 'klein', gewinn: true,
        dach: 'Gewonnen', gross: 'Ein Schnaitl', klein: 'Pils · 0,3 l',
        text: ['Das geht aufs Haus. Hol dir dein Schnaitl gleich am Stand.',
          'Zeig dort dieses Los. Wir prüfen die Losnummer ' + T.nrText(los.nr) + ' und den Prüfcode ' + los.pruef + '.']
      };
    }
    if (status === 'gewonnen') {
      return {
        motiv: 'stern-gold', stufe: 'haupt', gewinn: true, dach: 'Dein Los wurde gezogen', gross: preis.name,
        text: ['Herzlichen Glückwunsch! Hol deinen Gewinn am Stand ab.' + frist,
          'Zeig dort dieses Los. Wir prüfen die Losnummer ' + T.nrText(los.nr) + ' und den Prüfcode ' + los.pruef + '.']
      };
    }
    if (status === 'nichtGezogen') {
      const gezogen = datei.gewinner.filter((g) => g.topf === los.erg).map((g) => 'Nr. ' + T.nrText(g.nr));
      return {
        motiv: 'tanne', stufe: 'still', dach: 'Im Topf für ' + preis.topf, gross: 'Nicht gezogen',
        text: ['Die Ziehung ist vorbei, dein Los war leider nicht dabei.'
          + (gezogen.length ? ' Gezogen wurde: ' + gezogen.join(', ') + '.' : ''),
          'Danke fürs Mitmachen!']
      };
    }
    return {
      motiv: 'stern-gold', stufe: 'gross', gewinn: true, dach: 'Du bist im Lostopf für', gross: preis.topf,
      text: ['Dein Los ' + nr + ' nimmt an der Ziehung teil. ' + DATEN.ziehung]
    };
  }

  // Wer bei der Ziehung nicht dabei ist, schickt dem Verein sein Los per E-Mail oder WhatsApp.
  // Den Knopf gibt es nur, wenn in daten.js eine Adresse des Vereins eingetragen ist.
  function kontaktKasten(status) {
    if (status !== 'imTopf' && status !== 'gewonnen') return null;
    const losText = 'Los ' + nr + ', Prüfcode ' + los.pruef;
    const gewonnen = status === 'gewonnen';
    const nachricht = gewonnen
      ? 'Mein Los wurde bei der ' + DATEN.titel + ' gezogen: ' + preis.name + '.\n' + losText + '.\nWie komme ich zu meinem Gewinn?'
      : losText + ', im Lostopf für ' + preis.name + ' (' + DATEN.titel + ').\nBitte verständigt mich, wenn mein Los gezogen wird.';
    const links = T.kontaktLinks(DATEN.kontakt, DATEN.titel + ': Los ' + nr, nachricht);
    if (!links.length) return null;
    const kasten = el('div', 'kontakt');
    kasten.append(
      el('h2', '', gewonnen ? 'Du kannst nicht zum Stand kommen?' : 'Nicht bei der Ziehung dabei?'),
      el('p', '', gewonnen ? 'Schreib uns, dann machen wir uns die Übergabe aus.' : 'Schick uns dein Los. Wir melden uns bei dir, wenn es gezogen wird.')
    );
    const knoepfe = el('div', 'knoepfe');
    links.forEach((l, n) => {
      const a = el('a', 'knopf' + (n === 0 ? ' rot' : ''), l.art === 'mail' ? 'Per E-Mail schicken' : 'Per WhatsApp schicken');
      a.href = l.href;
      if (l.art !== 'mail') { a.target = '_blank'; a.rel = 'noopener'; }
      knoepfe.append(a);
    });
    kasten.append(knoepfe, el('small', '', 'Deine Nachricht verwenden wir nur, um dich wegen deines Loses zu erreichen, und löschen sie danach.'));
    return kasten;
  }

  // ---------- Los als Bild speichern ----------
  // Wer ein Los im Topf hat, kann es als Bild aufheben: mit Losnummer, Prüfcode, Preis
  // und einem QR-Code, der das Los wieder öffnet.
  // Am iPhone und iPad öffnet sich das Teilen-Fenster ("Bild sichern" für die Fotos, "In Dateien sichern"),
  // auf anderen Geräten lädt der Browser das Bild herunter.
  const bildName = 'Los-' + T.nrText(los.nr) + '-' + DATEN.titel.replace(/[^A-Za-z0-9ÄÖÜäöüß]+/g, '-') + '.png';
  const apfelGeraet = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function bildLaden(src) {
    return new Promise((fertig) => {
      const b = new Image();
      b.onload = () => fertig(b);
      b.onerror = () => fertig(null);
      b.src = src;
    });
  }

  function umbrechen(c, text, breite) {
    const zeilen = [];
    let zeile = '';
    String(text).split(/\s+/).forEach((wort) => {
      const probe = zeile ? zeile + ' ' + wort : wort;
      if (zeile && c.measureText(probe).width > breite) { zeilen.push(zeile); zeile = wort; } else zeile = probe;
    });
    if (zeile) zeilen.push(zeile);
    return zeilen;
  }

  async function losBild(status, datei) {
    const B = 1080;
    const H = 1500;
    const cv = document.createElement('canvas');
    cv.width = B;
    cv.height = H;
    const c = cv.getContext('2d');
    const block = (gr, gewicht) => (gewicht || 800) + ' ' + gr + 'px "Besley", Georgia, serif';
    const schwung = (gr) => gr + 'px "Playball", "Besley", cursive';
    try {
      await Promise.all([document.fonts.load(block(60)), document.fonts.load(block(60, 600)), document.fonts.load(schwung(60))]);
    } catch (e) { /* dann eben mit der Ersatzschrift */ }
    const logo = await bildLaden('motive/vtr-logo.png');
    const rund = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };

    // Nachthimmel mit ein paar Schneeflocken
    const himmel = c.createLinearGradient(0, 0, 0, H);
    himmel.addColorStop(0, '#10184A');
    himmel.addColorStop(1, '#2B3375');
    c.fillStyle = himmel;
    c.fillRect(0, 0, B, H);
    c.fillStyle = 'rgba(255, 255, 255, 0.5)';
    [[90, 60, 4], [300, 30, 3], [520, 80, 5], [760, 40, 3], [980, 100, 4], [1010, 300, 3], [40, 320, 4], [30, 900, 3],
      [1050, 760, 4], [1045, 1200, 3], [35, 1300, 4], [500, 1470, 3], [860, 1465, 4], [160, 1460, 3]].forEach((s) => {
      c.beginPath();
      c.arc(s[0], s[1], s[2], 0, Math.PI * 2);
      c.fill();
    });

    // Kopf
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#F6DC8C';
    c.font = schwung(60);
    c.fillText('Dein Los bei der', 70, 125);
    c.fillStyle = '#FBF3DC';
    let gr = 96;
    c.font = block(gr);
    while (gr > 50 && c.measureText(DATEN.titel).width > B - 140) { gr -= 4; c.font = block(gr); }
    c.fillText(DATEN.titel, 70, 225);
    c.font = block(36, 600);
    c.fillText(DATEN.verein || '', 70, 290);
    if (logo) c.drawImage(logo, B - 70 - 220, 254, 220, 220 * logo.height / logo.width);

    // Das Los: helle Karte mit rotem Kopf
    const kx = 60;
    const ky = 360;
    const kb = B - 120;
    const kh = H - ky - 70;
    c.save();
    rund(kx, ky, kb, kh, 44);
    c.clip();
    c.fillStyle = '#FBF8F0';
    c.fillRect(kx, ky, kb, kh);
    c.fillStyle = '#B8191F';
    c.fillRect(kx, ky, kb, 170);
    c.restore();
    c.fillStyle = '#F6DC8C';
    c.font = schwung(64);
    c.fillText('Dein Los', kx + 50, ky + 110);
    c.fillStyle = '#FBF3DC';
    c.font = block(98);
    c.textAlign = 'right';
    c.fillText(nr, kx + kb - 50, ky + 120);
    c.strokeStyle = 'rgba(29, 42, 92, 0.3)';
    c.lineWidth = 4;
    c.setLineDash([16, 12]);
    c.beginPath();
    c.moveTo(kx + 30, ky + 170 + 26);
    c.lineTo(kx + kb - 30, ky + 170 + 26);
    c.stroke();
    c.setLineDash([]);

    // Wofür das Los gilt
    const gewonnen = status === 'gewonnen';
    c.textAlign = 'center';
    let y = ky + 170 + 110;
    c.fillStyle = '#B8191F';
    c.font = block(34, 700);
    c.fillText((gewonnen ? 'Dein Los wurde gezogen' : 'Im Lostopf für').toUpperCase(), B / 2, y);
    const name = gewonnen ? preis.name : preis.topf;
    gr = 88;
    c.font = block(gr);
    let zeilen = umbrechen(c, name, kb - 120);
    while (zeilen.length > 2 && gr > 48) { gr -= 6; c.font = block(gr); zeilen = umbrechen(c, name, kb - 120); }
    c.fillStyle = '#1D2A5C';
    y += 30;
    zeilen.forEach((z) => { y += gr * 1.12; c.fillText(z, B / 2, y); });
    const frist = datei && datei.abholfrist ? ' Abholung: ' + datei.abholfrist + '.' : '';
    const info = gewonnen ? 'Herzlichen Glückwunsch! Hol deinen Gewinn am Stand ab.' + frist : DATEN.ziehung;
    c.font = block(34, 500);
    c.fillStyle = '#3A456F';
    y += 34;
    umbrechen(c, info, kb - 140).slice(0, 3).forEach((z) => { y += 48; c.fillText(z, B / 2, y); });

    // Unten: QR-Code, der das Los wieder öffnet, daneben Losnummer und Prüfcode
    const qg = 320;
    const qx = kx + 60;
    const qy = ky + kh - 60 - qg;
    let qrDa = false;
    try {
      const q = window.QR.matrix(location.href);
      const rand = 3;
      const modul = Math.floor(qg / (q.n + 2 * rand));
      const groesse = modul * (q.n + 2 * rand);
      c.fillStyle = '#FFFFFF';
      rund(qx, qy, groesse, groesse, 14);
      c.fill();
      c.fillStyle = '#000000';
      for (let zy = 0; zy < q.n; zy++) {
        for (let zx = 0; zx < q.n; zx++) {
          if (q.m[zy][zx]) c.fillRect(qx + (zx + rand) * modul, qy + (zy + rand) * modul, modul, modul);
        }
      }
      qrDa = true;
    } catch (e) { /* ohne QR-Code geht es auch */ }
    const tx = qrDa ? qx + qg + 50 : kx + 60;
    c.textAlign = 'left';
    c.fillStyle = '#59628A';
    c.font = block(30, 600);
    c.fillText('PRÜFCODE', tx, qy + 44);
    c.fillStyle = '#1D2A5C';
    c.font = block(104);
    c.fillText(los.pruef, tx, qy + 150);
    c.fillStyle = '#3A456F';
    c.font = block(28, 500);
    let ty = qy + 200;
    umbrechen(c, 'Für die Abholung brauchst du Losnummer und Prüfcode.' + (qrDa ? ' Der QR-Code öffnet dein Los wieder.' : ''), kx + kb - 50 - tx)
      .forEach((z) => { c.fillText(z, tx, ty); ty += 38; });

    return new Promise((fertig) => cv.toBlob(fertig, 'image/png'));
  }

  function speicherKasten(status, datei) {
    if (status !== 'imTopf' && status !== 'gewonnen') return null;
    const kasten = el('div', 'kontakt');
    kasten.append(
      el('h2', '', 'Heb dein Los gut auf'),
      el('p', '', 'Für einen Gewinn brauchst du Losnummer und Prüfcode. Speichere dein Los als Bild am Handy.')
    );
    const knopf = el('button', 'knopf rot', 'Los speichern');
    knopf.type = 'button';
    const hinweis = el('small', '', apfelGeraet
      ? 'Im nächsten Fenster „Bild sichern“ wählen (kommt in die Fotos) oder „In Dateien sichern“.'
      : 'Das Bild wird auf dein Handy heruntergeladen und liegt dann bei den Downloads.');
    // Das Bild entsteht schon vorab – das Teilen-Fenster öffnet sich nur direkt auf den Fingertipp hin.
    let bild = null;
    const vorbereiten = () => {
      if (!bild) {
        bild = losBild(status, datei)
          .then((blob) => (blob ? new File([blob], bildName, { type: 'image/png' }) : null))
          .catch(() => null);
      }
      return bild;
    };
    setTimeout(vorbereiten, 300);
    knopf.addEventListener('click', async () => {
      const fertig = await vorbereiten();
      if (!fertig) {
        hinweis.textContent = 'Das Bild ließ sich nicht erstellen. Bitte mach stattdessen einen Screenshot von dieser Seite.';
        return;
      }
      if (apfelGeraet && navigator.canShare && navigator.canShare({ files: [fertig] })) {
        try {
          await navigator.share({ files: [fertig] });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;   // Fenster ohne Auswahl geschlossen
        }
      }
      const a = el('a');
      a.href = URL.createObjectURL(fertig);
      a.download = bildName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    const knoepfe = el('div', 'knoepfe');
    knoepfe.append(knopf);
    kasten.append(knoepfe, hinweis);
    return kasten;
  }

  function fuellen(status, datei) {
    const i = inhalt(status, datei);
    $('ergebnis').classList.toggle('gewinn', !!i.gewinn);
    $('ergebnis').dataset.stufe = i.stufe;
    $('ergebnis').dataset.art = status;
    $('dach').textContent = i.dach;
    $('gross').textContent = i.gross;
    $('gross').classList.toggle('lang', i.gross.length > 14);
    $('klein').textContent = i.klein || '';
    $('klein').hidden = !i.klein;
    const details = $('details');
    details.replaceChildren(...i.text.map((t) => el('p', '', t)));
    if (i.merken) details.append(el('p', 'merken', i.merken));
    if (ohneNetz && status === 'imTopf') {
      details.append(el('p', 'klein-text', 'Gerade keine Verbindung: Ob dein Los schon gezogen wurde, siehst du hier erst wieder mit Internet.'));
    }
    const speichern = speicherKasten(status, datei);
    if (speichern) details.append(speichern);
    const kasten = kontaktKasten(status);
    if (kasten) details.append(kasten);
    if (i.bild) {
      const foto = el('img');
      foto.src = 'motive/' + i.bild;
      foto.alt = i.bildText || '';
      $('motiv').replaceChildren(foto);
    } else {
      fetch('motive/' + i.motiv + '.svg')
        .then((r) => (r.ok ? r.text() : ''))
        .then((svg) => { $('motiv').innerHTML = svg; })
        .catch(() => {});
    }
    return i;
  }

  function aufdecken(status, i, feiern) {
    $('decke').classList.add('weg');
    $('antippen').hidden = true;
    $('ergebnis').removeAttribute('aria-hidden');
    $('ergebnis').classList.add('offen');
    $('details').hidden = false;
    $('ansage').textContent = i.dach + ': ' + i.gross;
    merken(status);
    if (feiern && !ruhig) auftritt(i.stufe);
  }

  // ---------- Auftritt nach dem Rubbeln ----------
  // Die Bewegungen selbst stehen in stil.css (Abschnitt "Auftritt"); hier werden sie nur ausgelöst.
  function auftritt(stufe) {
    $('ergebnis').classList.add('auftritt');
    $('details').classList.add('auftritt');
    if (stufe === 'still') return;
    const gross = stufe === 'gross' || stufe === 'haupt';
    if (gross) $('karte').classList.add('wumms');
    // Handys mit Android vibrieren kurz mit; iPhones können das im Browser nicht.
    try {
      if (navigator.vibrate) navigator.vibrate(gross ? [70, 50, 70, 50, 220] : [60]);
    } catch (e) { /* nicht wichtig */ }
    konfetti(stufe);
  }

  // ---------- Rubbelfeld ----------
  // ---------- Folienkrümel ----------
  // Wie bei einem echten Rubbellos: Was der Finger abkratzt, wird ein Stück weggeschoben, fällt und verschwindet.
  // Gibt eine Funktion zurück, die an einer Stelle des Bildschirms Krümel in Wischrichtung losschickt.
  function kruemelMaschine(masstab) {
    const canvas = $('spaene');
    if (!canvas || ruhig) return () => {};
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = canvas.getContext('2d');
    let W = 0;
    let H = 0;
    const anpassen = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    anpassen();
    window.addEventListener('resize', anpassen);

    // Dunkler als die Folie, damit man die Krümel auf dem Gold sieht – dazwischen ein paar helle Glanzstücke.
    const farben = ['#8A6A1F', '#A27A22', '#6F5417', '#B98F2F', '#8A6A1F', '#FFF4CC'];
    const zufall = (a, b) => a + Math.random() * (b - a);
    const teile = [];
    let laeuft = false;
    let zuletzt = 0;

    function bild(t) {
      const dt = Math.min(0.04, (t - zuletzt) / 1000);
      zuletzt = t;
      c.clearRect(0, 0, W, H);
      // Ein zarter Schatten hebt die Krümel von der Folie ab.
      c.shadowColor = 'rgba(40, 28, 0, 0.35)';
      c.shadowBlur = 2;
      c.shadowOffsetY = 1;
      for (let i = teile.length - 1; i >= 0; i--) {
        const p = teile[i];
        p.alter += dt;
        if (p.alter >= p.leben) { teile.splice(i, 1); continue; }
        p.vy += 640 * masstab * dt;          // Schwerkraft
        p.vx *= 1 - 1.8 * dt;                // die Luft bremst
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.winkel += p.dreh * dt;
        c.globalAlpha = Math.min(1, (1 - p.alter / p.leben) * 2.4);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.winkel);
        c.fillStyle = p.farbe;
        c.fillRect(-p.b / 2, -p.h / 2, p.b, p.h);
        c.restore();
      }
      c.globalAlpha = 1;
      if (teile.length) requestAnimationFrame(bild);
      else laeuft = false;
    }

    // x, y: Stelle am Bildschirm. rx, ry: Wischrichtung (Länge 1, oder 0 beim Antippen).
    return (x, y, rx, ry) => {
      if (teile.length >= 140) return;
      const tempo = zufall(70, 190) * masstab;
      teile.push({
        x: x + rx * 16 * masstab + zufall(-10, 10) * masstab,
        y: y + ry * 16 * masstab + zufall(-10, 10) * masstab,
        vx: rx * tempo + zufall(-75, 75) * masstab,
        vy: ry * tempo * 0.6 - zufall(30, 110) * masstab,   // ein kleiner Hüpfer, dann fällt der Krümel
        b: zufall(2.5, 6.5) * masstab,
        h: zufall(1.5, 3.4) * masstab,
        winkel: zufall(0, Math.PI),
        dreh: zufall(-9, 9),
        farbe: farben[Math.floor(Math.random() * farben.length)],
        alter: 0,
        leben: zufall(0.5, 0.95)
      });
      if (!laeuft) {
        laeuft = true;
        zuletzt = performance.now();
        requestAnimationFrame(bild);
      }
    };
  }

  function rubbelfeld(fertig) {
    const canvas = $('decke');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.scale(dpr, dpr);

    // Goldfolie mit Glanzstreifen und ein paar Sternen
    const folie = c.createLinearGradient(0, 0, w, h);
    folie.addColorStop(0, '#F3D98C');
    folie.addColorStop(0.5, '#D7AC4A');
    folie.addColorStop(1, '#EDCF7C');
    c.fillStyle = folie;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255, 255, 255, 0.17)';
    c.lineWidth = 9;
    for (let x = -h; x < w; x += 34) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + h, h);
      c.stroke();
    }
    const stern = (x, y, r) => {
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const wi = -Math.PI / 2 + k * Math.PI / 5;
        const rad = k % 2 ? r * 0.42 : r;
        c.lineTo(x + Math.cos(wi) * rad, y + Math.sin(wi) * rad);
      }
      c.closePath();
      c.fill();
    };
    c.fillStyle = 'rgba(255, 255, 255, 0.4)';
    [[0.13, 0.16, 0.05], [0.86, 0.13, 0.035], [0.9, 0.5, 0.025], [0.1, 0.56, 0.03], [0.17, 0.87, 0.04],
      [0.82, 0.86, 0.05], [0.5, 0.12, 0.022], [0.55, 0.9, 0.025]].forEach((s) => stern(w * s[0], h * s[1], w * s[2]));
    c.strokeStyle = 'rgba(29, 42, 92, 0.55)';
    c.lineWidth = 2.5;
    c.setLineDash([9, 7]);
    c.strokeRect(12, 12, w - 24, h - 24);
    c.setLineDash([]);
    c.fillStyle = '#1D2A5C';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let gr = w * 0.25;
    c.font = '800 ' + gr + 'px "Besley", Georgia, serif';
    gr *= Math.min(1, (w * 0.72) / c.measureText('Rubbeln').width);
    c.font = '800 ' + gr + 'px "Besley", Georgia, serif';
    c.fillText('Rubbeln', w / 2, h * 0.46);
    c.font = '600 ' + w * 0.052 + 'px "Besley", Georgia, serif';
    c.fillText('mit dem Finger freilegen', w / 2, h * 0.46 + gr * 0.74);

    // Ab hier nimmt jedes Darüberfahren nur einen Teil der Folie weg: Sie wird nach und nach durchsichtiger,
    // und man muss ein paar Mal rubbeln, bis das Ergebnis frei liegt.
    // Der Finger setzt in festen Abständen weiche Tupfer. So zählt der Weg des Fingers –
    // nicht, wie oft das Handy die Bewegung meldet.
    const STAERKE = 0.085;             // so viel nimmt ein Tupfer in seiner Mitte weg (einmal darüberfahren: etwa 40 %)
    const FREI_AB = 90;                // unter dieser Deckkraft (von 255) gilt eine Stelle als freigerubbelt – etwa nach dreimal
    const ANTEIL = 0.33;               // so viel der Fläche muss frei sein, dann wird aufgedeckt
    const radius = w * 0.15;
    const abstand = radius * 0.25;
    const tupfer = document.createElement('canvas');
    tupfer.width = tupfer.height = Math.ceil(radius * 2 * dpr);
    const tc = tupfer.getContext('2d');
    const mitte = tupfer.width / 2;
    const verlauf = tc.createRadialGradient(mitte, mitte, 0, mitte, mitte, mitte);
    verlauf.addColorStop(0, 'rgba(0, 0, 0, ' + STAERKE + ')');
    verlauf.addColorStop(0.5, 'rgba(0, 0, 0, ' + STAERKE + ')');
    verlauf.addColorStop(1, 'rgba(0, 0, 0, 0)');
    tc.fillStyle = verlauf;
    tc.fillRect(0, 0, tupfer.width, tupfer.height);

    c.globalCompositeOperation = 'destination-out';
    const kruemel = kruemelMaschine(w / 311);
    let gesummt = 0;
    // Setzt einen Tupfer. Wo noch Folie liegt, fliegen dabei Krümel weg – je dünner die Folie, desto weniger.
    const tupfen = (x, y, rx, ry) => {
      const px = Math.round(x * dpr);
      const py = Math.round(y * dpr);
      const folieDa = px >= 0 && py >= 0 && px < canvas.width && py < canvas.height
        ? c.getImageData(px, py, 1, 1).data[3] / 255
        : 0;
      c.drawImage(tupfer, x - radius, y - radius, radius * 2, radius * 2);
      if (folieDa < 0.08) return;
      const r = canvas.getBoundingClientRect();
      if (Math.random() < folieDa) kruemel(r.left + x, r.top + y, rx, ry);
      if (Math.random() < folieDa * 0.6) kruemel(r.left + x, r.top + y, rx, ry);
      // Ein feines Kribbeln unter dem Finger, wo das Handy es kann (Android).
      const jetzt = Date.now();
      if (navigator.vibrate && !ruhig && jetzt - gesummt > 90) {
        gesummt = jetzt;
        navigator.vibrate(5);
      }
    };
    let letzter = null;
    let seitTupfer = 0;                // Weg seit dem letzten Tupfer
    let zaehler = 0;
    let erledigt = false;
    const punkt = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const wisch = (a, b) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const lang = Math.hypot(dx, dy);
      let pos = abstand - seitTupfer;
      while (pos <= lang) {
        tupfen(a[0] + dx * pos / lang, a[1] + dy * pos / lang, dx / lang, dy / lang);
        pos += abstand;
      }
      seitTupfer = lang - (pos - abstand);
    };
    const pruefen = () => {
      if (erledigt) return;
      const d = c.getImageData(0, 0, canvas.width, canvas.height).data;
      let frei = 0;
      let alle = 0;
      for (let i = 3; i < d.length; i += 4 * 23) {
        alle++;
        if (d[i] < FREI_AB) frei++;
      }
      if (frei / alle > ANTEIL) { erledigt = true; fertig(); }
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      letzter = punkt(e);
      tupfen(letzter[0], letzter[1], 0, 0);
      seitTupfer = 0;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!letzter) return;
      const p = punkt(e);
      wisch(letzter, p);
      letzter = p;
      if (++zaehler % 6 === 0) pruefen();
    });
    ['pointerup', 'pointercancel'].forEach((name) => canvas.addEventListener(name, () => {
      letzter = null;
      pruefen();
    }));
  }

  // ---------- Konfetti in den Vereinsfarben ----------
  // klein: ein sanfter Stoß. gross: Stoß aus der Mitte, Kanonen von beiden Seiten, Regen von oben.
  // haupt: wie gross, aber länger.
  function konfetti(stufe) {
    const canvas = $('konfetti');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    const farben = ['#009934', '#00A2E8', '#FFEB00', '#FF0000', '#FBF3DC', '#E6BE5A', '#B8191F'];
    const zufall = (a, b) => a + Math.random() * (b - a);
    const feld = $('ergebnis').getBoundingClientRect();
    const mx = feld.left + feld.width / 2;
    const my = feld.top + feld.height / 2;
    const teile = [];

    function teil(x, y, vx, vy) {
      const wurf = Math.random();
      teile.push({
        x, y, vx, vy,
        form: wurf < 0.55 ? 'blatt' : wurf < 0.8 ? 'punkt' : 'band',
        g: zufall(6, 12), rot: zufall(0, 6.3), vr: zufall(-9, 9),
        kipp: zufall(0, 6.3), vk: zufall(5, 11), alter: 0,
        farbe: farben[Math.floor(Math.random() * farben.length)]
      });
    }
    function stoss(x, y, richtung, streuung, anzahl, tempo) {
      for (let n = 0; n < anzahl; n++) {
        const w = richtung + zufall(-streuung, streuung);
        const v = tempo * zufall(0.4, 1);
        teil(x, y, Math.cos(w) * v, Math.sin(w) * v);
      }
    }
    const mitte = (anzahl, tempo) => () => stoss(mx, my, -Math.PI / 2, 1.3, anzahl, H * tempo);
    const kanonen = (anzahl) => () => {
      stoss(-10, H * 0.92, -Math.PI * 0.36, 0.3, anzahl, H * 2.3);
      stoss(W + 10, H * 0.92, -Math.PI * 0.64, 0.3, anzahl, H * 2.3);
    };
    const regen = (anzahl) => () => {
      for (let n = 0; n < anzahl; n++) teil(zufall(0, W), zufall(-H * 0.3, -10), zufall(-30, 30), zufall(H * 0.1, H * 0.3));
    };

    // Drehbuch: [Sekunde, was passiert]
    const plan = stufe === 'klein'
      ? [[0, mitte(46, 0.85)]]
      : [[0, mitte(130, 1.3)], [0.25, kanonen(55)], [0.7, regen(45)], [1.15, kanonen(40)], [1.6, regen(45)]];
    if (stufe === 'haupt') {
      plan.push([2.1, kanonen(55)], [2.6, regen(55)], [3.1, mitte(90, 1.3)], [3.7, kanonen(45)], [4.2, regen(60)]);
    }

    const start = performance.now();
    let vorher = start;
    (function bild(jetzt) {
      const dt = Math.min(0.05, (jetzt - vorher) / 1000);
      vorher = jetzt;
      const zeit = (jetzt - start) / 1000;
      while (plan.length && plan[0][0] <= zeit) plan.shift()[1]();

      c.clearRect(0, 0, W, H);
      for (let n = teile.length - 1; n >= 0; n--) {
        const p = teile[n];
        p.alter += dt;
        // Papier: schnell los, dann vom Luftwiderstand gebremst und flatternd nach unten.
        p.vx -= p.vx * 2.2 * dt;
        p.vy += (H * 1.3 - p.vy * 2.2) * dt;
        p.x += (p.vx + Math.sin(p.alter * p.vk * 0.5 + p.kipp) * 45) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y > H + 30 || p.alter > 9) { teile.splice(n, 1); continue; }
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.scale(1, Math.cos(p.alter * p.vk + p.kipp));   // kippt wie ein Blatt Papier
        c.fillStyle = p.farbe;
        if (p.form === 'punkt') {
          c.beginPath();
          c.arc(0, 0, p.g * 0.42, 0, 6.3);
          c.fill();
        } else if (p.form === 'band') {
          c.fillRect(-p.g * 0.17, -p.g * 1.1, p.g * 0.34, p.g * 2.2);
        } else {
          c.fillRect(-p.g / 2, -p.g / 3, p.g, p.g * 0.66);
        }
        c.restore();
      }
      if (plan.length || teile.length) requestAnimationFrame(bild);
    })(start);
  }

  // ---------- Ablauf ----------
  // Gewinnnummern holen. Ohne Netz oder vor der Ziehung gilt einfach das Ergebnis aus dem Link.
  let ohneNetz = false;
  const gewinner = fetch('gewinner.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => { ohneNetz = true; return null; });
  const schrift = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('800 40px "Besley"'), document.fonts.load('600 16px "Besley"'), document.fonts.load('20px "Playball"')]).catch(() => {})
    : Promise.resolve();

  Promise.all([gewinner, schrift]).then(([datei]) => {
    const status = T.losStatus(los, datei);
    const i = fuellen(status, datei);
    if (gemerkt) {
      // Schon einmal aufgerubbelt: gleich zeigen. Gefeiert wird nur, wenn der Gewinn neu ist.
      aufdecken(status, i, status === 'gewonnen' && gemerkt !== 'gewonnen');
      return;
    }
    rubbelfeld(() => aufdecken(status, i, true));
    $('antippen').addEventListener('click', () => aufdecken(status, i, true));
  });
})();
