const CACHE_NAME = "card-count-v4";

const PRECACHE_URLS = [
  "/",
  "/app.js",
  "/multiplayer.js",
  "/site.webmanifest",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
];

async function cacheIfAvailable(cache, url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      await cache.put(url, response.clone());
    }
  } catch {
    // Offline waehrend der Installation soll den SW nicht blockieren.
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === "navigate") {
      const fallbackResponse = await caches.match("/");
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }

    throw new Error("Network and cache unavailable");
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(PRECACHE_URLS.map((url) => cacheIfAvailable(cache, url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/socket.io") || url.pathname.startsWith("/api")) {
    return;
  }

  event.respondWith(networkFirst(request));
});
