// Legt die App im Gerät ab, damit sie ohne Internet aufgeht:
// die Stand-App am Tablet und ein schon einmal geöffnetes Los am Kundenhandy.
// Mit Internet kommt immer die frische Fassung. Der Gerätespeicher springt ein, wenn keine Verbindung da ist
// oder wenn sie länger als ein paar Sekunden braucht (schlechter Empfang am Stand).
const CACHE = 'tombola-v13';
const FRIST = 4000;   // Millisekunden
const ASSETS = [
  './', 'index.html', 'los.html', 'gewinner.html', 'gewinner.js', 'stil.css', 'daten.js', 'logik.js', 'qr.js', 'stand.js', 'los.js', 'manifest.json',
  'fonts/Besley-VF.ttf', 'fonts/Playball-Regular.ttf',
  'motive/himmel.svg', 'motive/girlande.svg', 'motive/stern-gold.svg', 'motive/tasse.svg', 'motive/tanne.svg', 'motive/schnaitl.jpg', 'motive/vtr-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Die Gewinnnummern müssen immer aktuell sein und werden nie aus dem Gerätespeicher beantwortet.
  if (url.pathname.endsWith('gewinner.json')) return;
  event.respondWith(antworten(req));
});

async function antworten(req) {
  const gespeichert = await caches.match(req, { ignoreSearch: true });
  const frisch = fetch(req).then((res) => {
    if (res.ok) {
      const kopie = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, kopie));
    }
    return res;
  });
  if (!gespeichert) return frisch;
  const frist = new Promise((fertig) => setTimeout(() => fertig(gespeichert), FRIST));
  return Promise.race([frisch.catch(() => gespeichert), frist]);
}
