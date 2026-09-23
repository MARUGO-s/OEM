// Retire the previous OEM service worker. Do not touch caches/registrations
// belonging to other applications on the shared GitHub Pages origin.
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});
