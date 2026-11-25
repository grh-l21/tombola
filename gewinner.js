// Seite mit allen Gewinnnummern: für alle, die bei der Ziehung nicht dabei waren
// oder von ihrem Los nur einen Screenshot haben. Liest dieselbe gewinner.json wie die Los-Seite.
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

  $('titel').textContent = DATEN.titel;
  $('verein').textContent = DATEN.verein || '';
  document.title = 'Gewinnnummern – ' + DATEN.titel;

  let datei = null;

  function zeichnen(geladen) {
    const liste = T.gewinnerListe(datei, PREISE);
    const gezogen = liste.some((z) => z.nummern.length);
    const status = $('status');
    if (!geladen) {
      status.textContent = 'Die Gewinnnummern lassen sich gerade nicht laden. Bitte versuch es später noch einmal.';
    } else if (!gezogen) {
      status.textContent = DATEN.ziehung + ' Danach stehen die Gewinnnummern hier.';
    } else {
      const wann = datei.stand
        ? 'Stand: ' + new Date(datei.stand).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) + ' Uhr. '
        : '';
      status.textContent = wann + (datei.abholfrist ? 'Abholung: ' + datei.abholfrist + '.' : '');
      status.hidden = !status.textContent;
    }

    $('liste').replaceChildren(...liste.map((z) => {
      const li = el('li');
      li.append(el('span', 'preis', z.name));
      if (z.nummern.length) {
        const nummern = el('span', 'nummern block');
        z.nummern.forEach((nr) => nummern.append(el('span', '', 'Nr. ' + T.nrText(nr))));
        li.append(nummern);
        if (z.nummern.length < z.ziehungen && !z.fertig) li.append(el('span', 'offen', 'Weitere Ziehung folgt.'));
      } else {
        li.append(el('span', 'offen', 'noch nicht gezogen'));
      }
      return li;
    }));
    $('pruefForm').hidden = !gezogen;
  }

  $('pruefForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nr = $('pruefNr').value.trim();
    const aus = $('pruefErgebnis');
    if (!/^\d{1,6}$/.test(nr) || Number(nr) < 1) {
      aus.textContent = 'Bitte nur die Losnummer eingeben, zum Beispiel 42.';
      aus.className = 'ergebnis-zeile';
    } else {
      const preis = T.nummerSuchen(datei, PREISE, nr);
      aus.textContent = preis
        ? 'Los Nr. ' + T.nrText(Number(nr)) + ' wurde gezogen: ' + preis.name + '. Herzlichen Glückwunsch!'
        : 'Los Nr. ' + T.nrText(Number(nr)) + ' wurde nicht gezogen.';
      aus.className = 'ergebnis-zeile ' + (preis ? 'gut' : 'schlecht');
    }
    aus.hidden = false;
  });

  // Wer gewonnen hat und nicht zum Stand kommen kann, schreibt dem Verein.
  const links = T.kontaktLinks(DATEN.kontakt, DATEN.titel + ': Gewinn',
    'Mein Los wurde bei der ' + DATEN.titel + ' gezogen.\nLosnummer: \nPrüfcode: \nWie komme ich zu meinem Gewinn?');
  if (links.length) {
    const kasten = el('div', 'kontakt');
    kasten.append(el('h2', '', 'Gewonnen und nicht am Stand?'), el('p', '', 'Schreib uns, dann machen wir uns die Übergabe aus.'));
    const knoepfe = el('div', 'knoepfe');
    links.forEach((l) => {
      const a = el('a', 'knopf', l.art === 'mail' ? 'E-Mail schreiben' : 'WhatsApp schreiben');
      a.href = l.href;
      if (l.art !== 'mail') { a.target = '_blank'; a.rel = 'noopener'; }
      knoepfe.append(a);
    });
    kasten.append(knoepfe);
    $('kontakt').append(kasten);
  }

  fetch('gewinner.json', { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((d) => { datei = d; zeichnen(true); })
    .catch(() => zeichnen(false));
})();
