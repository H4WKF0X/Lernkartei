/**
 * Service Worker der Lernkartei.
 *
 * Die App-Shell und vendor/ laufen über Cache-First. Die Deck-Dateien und
 * decks/index.json laufen über Network-First mit dem Cache als Rückfall.
 * GitHub Pages liefert Dateien mit einer Cache-Dauer von etwa zehn Minuten.
 * Ohne Network-First sieht der Lehrer eine geänderte Datei zu spät.
 */

/*
 * Diese Nummer muss bei jeder Änderung an den App-Dateien steigen. Sonst
 * liefert der Cache die alten Dateien weiter.
 */
const CACHE_NAME = 'lernkartei-v2';

const INDEX_FILE = 'decks/index.json';

const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'js/app.js',
  'js/parser.js',
  'js/render.js',
  'js/session.js',
  'js/store.js',
  'vendor/katex/katex.min.css',
  'vendor/katex/katex.min.js',
  'vendor/katex/mhchem.min.js',
  'vendor/fonts/JetBrainsMono-Regular.woff2',
  'vendor/fonts/JetBrainsMono-Bold.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  'vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  'vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  'vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  'vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  'vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  'vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  'vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  'vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  'vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Script-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
  'vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2',
];

/**
 * Legt die Deck-Liste und alle Deck-Dateien in den Cache.
 *
 * Ohne diesen Schritt fehlen die Decks im Flugmodus. Die Seite holt die
 * Liste beim ersten Besuch, bevor der Service Worker sie steuert.
 *
 * @param {Cache} cache Der Cache der App.
 * @returns {Promise<void>} Erfüllt, wenn alle Versuche durch sind.
 */
async function cacheDecks(cache) {
  const request = new Request(INDEX_FILE, { cache: 'reload' });
  const response = await fetch(request);
  if (!response.ok) {
    return;
  }
  const entries = await response.clone().json();
  await cache.put(INDEX_FILE, response);
  if (!Array.isArray(entries)) {
    return;
  }
  const files = entries
    .map((entry) => (typeof entry.file === 'string' ? entry.file : ''))
    .filter((file) => file.length > 0);
  await Promise.allSettled(
    files.map(async (file) => {
      const deck = await fetch(new Request(file, { cache: 'reload' }));
      if (deck.ok) {
        await cache.put(file, deck);
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await cacheDecks(cache).catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== CACHE_NAME) {
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * Sagt, ob eine Anfrage zu den Deck-Daten gehört.
 *
 * @param {URL} url Die Adresse der Anfrage.
 * @returns {boolean} true bei einer Datei unter decks/.
 */
function isDeckRequest(url) {
  return url.pathname.includes('/decks/');
}

/**
 * Holt eine Antwort aus dem Netz und legt sie in den Cache.
 *
 * @param {Request} request Die Anfrage.
 * @returns {Promise<Response>} Die Antwort aus dem Netz.
 */
async function fetchAndStore(request) {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request.url, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isDeckRequest(url)) {
    event.respondWith(
      (async () => {
        try {
          return await fetchAndStore(request);
        } catch (error) {
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached !== undefined) {
            return cached;
          }
          throw error;
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached !== undefined) {
        return cached;
      }
      try {
        return await fetchAndStore(request);
      } catch (error) {
        const fallback = await caches.match('index.html');
        if (request.mode === 'navigate' && fallback !== undefined) {
          return fallback;
        }
        throw error;
      }
    })(),
  );
});
