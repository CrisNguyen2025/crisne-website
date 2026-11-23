self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Minimal pass-through handler so Android Chrome treats the app as a full PWA with share_target,
// while never caching private /news pages or authenticated API responses.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/share") return;
  event.respondWith(fetch(event.request));
});
