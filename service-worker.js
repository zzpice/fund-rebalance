const VERSION = "3.1.5";
const CACHE_PREFIX = "fund-rebalance-";
const CACHE_NAME = `${CACHE_PREFIX}v${VERSION}`;
const resolve = path => new URL(path, self.location.href).href;
const INDEX_URL = resolve("./index.html");
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./manifest-dark.webmanifest",
  "./src/theme.js",
  "./styles/app.css",
  "./src/app.js",
  "./src/portfolio.js",
  "./src/rebalance.js",
  "./src/format.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
].map(resolve);

// Install a complete generation, then wait until all older pages close or the user refreshes.
// Serving HTML and modules from one cache avoids mixing a new page with an old offline module.
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll(APP_SHELL.map(url => new Request(url, {cache: "reload"})))
  ));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key !== CACHE_NAME && key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const index = url.origin === self.location.origin &&
    [resolve("./"), INDEX_URL].includes(url.origin + url.pathname);
  if (!index && !APP_SHELL.includes(url.href)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const saved = await cache.match(index ? INDEX_URL : request);
    return saved || fetch(request);
  }));
});
