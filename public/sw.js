const CACHE_NAME = "voters-are-never-happy-v1";
const BASE_URL = new URL("./", self.location.href);
const CORE_ASSETS = [
  "manifest.webmanifest",
  "icons/app-icon.svg",
  "icons/app-icon-192.png",
  "icons/app-icon-512.png",
  "icons/app-icon-maskable-512.png",
].map((path) => new URL(path, BASE_URL).href);

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const page = await fetch(BASE_URL.href, { cache: "reload" });
  await cache.put(BASE_URL.href, page.clone());

  const html = await page.text();
  const discoveredAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], BASE_URL))
    .filter((url) => url.origin === BASE_URL.origin && url.pathname.startsWith(BASE_URL.pathname))
    .map((url) => url.href);

  await cache.addAll([...new Set([...CORE_ASSETS, ...discoveredAssets])]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== BASE_URL.origin || !url.pathname.startsWith(BASE_URL.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) await (await caches.open(CACHE_NAME)).put(BASE_URL.href, response.clone());
          return response;
        })
        .catch(() => caches.match(BASE_URL.href)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then(async (response) => {
        if (response.ok) await (await caches.open(CACHE_NAME)).put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached ?? network;
    }),
  );
});
