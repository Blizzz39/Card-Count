const CACHE_NAME = 'card-count-v1';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/index.js',
    '/apple-touch-icon.png',
    '/favicon.ico',
    '/favicon-32x32.png',
    '/favicon-16x16.png',
    '/site.webmanifest'
];

// Installation: alle statischen Assets cachen
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Aktivierung: alten Cache loeschen
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// Fetch: Cache-first fuer statische Assets, Network-first fuer API/Socket
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Socket.io und API-Anfragen immer ans Netzwerk weiterleiten
    if (url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api')) {
        return; // kein cachen, einfach durchlassen
    }

    // Alles andere: erst Cache, dann Netzwerk
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((response) => {
                // Neue Dateien auch in Cache schreiben
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
        }).catch(() => {
            // Offline-Fallback: Hauptseite zurueckgeben
            return caches.match('/index.html');
        })
    );
});