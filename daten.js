// Stammdaten der Tombola. Stand-App und Los-Seite lesen beide diese Datei.
// Preise hier ändern – die "id" eines Preises steht im Los-Link und darf sich
// nach dem ersten verkauften Los nicht mehr ändern.
(function (root) {
  const DATEN = {
    titel: 'Glühwein-Tombola',
    // Steht auf der Los-Seite unter dem Titel.
    verein: 'der Vöcklabrucker Tafelrunde',
    // Steht auf jedem Los, das in einem Topf liegt.
    ziehung: 'Die Ziehung ist am Samstag, 19. Dezember, um 20 Uhr am Stand.',
    // Wer bei der Ziehung nicht dabei ist, kann dem Verein sein Los schicken und wird bei einem Gewinn verständigt.
    // Hier die Adresse des Vereins eintragen – eine oder beide. Bleibt beides leer, gibt es den Knopf am Los nicht.
    kontakt: {
      mail: 'gregor.hoeller.vtr@gmail.com',
      whatsapp: '+436648543200'    // Handynummer mit Ländervorwahl
    },
    // Adresse der gemeinsamen Liste für mehrere Verkaufsgeräte (das Programm im Ordner "ablage", bei Cloudflare).
    // Leer = jedes Gerät verkauft nur für sich.
    ablage: '',
    preise: [
      { id: 'ski',    name: 'Fischer Ski',                 topf: 'Fischer Ski',                 ziehungen: 1 },
      { id: 'reifen', name: 'Reifen von RWA',              topf: 'Reifen von RWA',              ziehungen: 1 },
      { id: 'gastro', name: 'Gastrogutschein',             topf: 'einen von 3 Gastrogutscheinen', ziehungen: 3 },
      { id: 'vip',    name: '2 VIP-Karten Blau-Weiß Linz', topf: '2 VIP-Karten Blau-Weiß Linz', ziehungen: 1 },
      { id: 'stella', name: '2 Karten für Pavlo Stella',   topf: '2 Karten für Pavlo Stella',   ziehungen: 1 }
    ]
  };
  if (typeof module === 'object' && module.exports) module.exports = DATEN;
  else root.TOMBOLA_DATEN = DATEN;
})(typeof self !== 'undefined' ? self : this);
