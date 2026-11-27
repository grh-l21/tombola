// Stammdaten der Tombola. Stand-App und Los-Seite lesen beide diese Datei.
// Preise hier ändern. Alle Preise liegen in einem gemeinsamen Preistopf und werden bei der Ziehung
// nacheinander gezogen; "ziehungen" sagt, wie oft ein Preis vergeben wird.
// Die "id" eines Preises steht in der Ziehung und darf sich nach der ersten Ziehung nicht mehr ändern.
(function (root) {
  const DATEN = {
    titel: 'Glühwein-Tombola',
    // Steht auf der Los-Seite unter dem Titel.
    verein: 'der Vöcklabrucker Tafelrunde',
    // Steht auf jedem Los, das im Preistopf liegt.
    ziehung: 'Die Ziehung ist am Samstag, 19. Dezember, um 17 Uhr am Stand.',
    // Wer bei der Ziehung nicht dabei ist, kann dem Verein sein Los schicken und wird bei einem Gewinn verständigt.
    // Hier die Adresse des Vereins eintragen – eine oder beide. Bleibt beides leer, gibt es den Knopf am Los nicht.
    kontakt: {
      mail: 'gregor.hoeller.vtr@gmail.com',
      whatsapp: '+436648543200'    // Handynummer mit Ländervorwahl
    },
    // Adresse der Stand-App im Internet. Dorthin führt der QR-Code "Gerät hinzufügen".
    adresse: 'https://vtr-gluehwein-tombola.pages.dev/',
    // Adresse der gemeinsamen Liste für mehrere Verkaufsgeräte (das Programm im Ordner "ablage", bei Cloudflare).
    // Leer = jedes Gerät verkauft nur für sich.
    ablage: 'https://tombola-ablage.tombola-ablage.workers.dev',
    preise: [
      { id: 'ski',    name: 'Fischer Ski',                 ziehungen: 1 },
      { id: 'reifen', name: 'Reifen von RWA',              ziehungen: 1 },
      { id: 'gastro', name: 'Gastrogutschein',             ziehungen: 3 },
      { id: 'vip',    name: '2 VIP-Karten Blau-Weiß Linz', ziehungen: 1 },
      { id: 'stella', name: '2 Karten für Pavlo Stella',   ziehungen: 1 },
      { id: 'earbuds',  name: 'Skullcandy Earbuds',              ziehungen: 15 },
      { id: 'autocare', name: 'Mercedes Pappas Auto-Care Paket', ziehungen: 1 },
      { id: 'hotel',    name: 'Hotelgutschein',                  ziehungen: 1 }
    ]
  };
  // Die Tombola ist umgezogen. Wer noch die frühere Adresse öffnet (github.io), wird zur neuen geschickt –
  // samt dem Teil nach dem #, in dem das Los oder der Team-Code steckt.
  if (typeof location !== 'undefined' && /(^|\.)github\.io$/.test(location.hostname) && DATEN.adresse) {
    location.replace(DATEN.adresse.replace(/\/?$/, '/') + location.pathname.split('/').pop() + location.search + location.hash);
  }
  if (typeof module === 'object' && module.exports) module.exports = DATEN;
  else root.TOMBOLA_DATEN = DATEN;
})(typeof self !== 'undefined' ? self : this);
