// Minimal service worker for team chat push notifications only — no fetch
// handler, no offline caching, not building general PWA infrastructure.

self.addEventListener("push", (event) => {
  let payload = { title: "Turf IQ", body: "You have a new message.", url: "/chat" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // fall back to the default payload above
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
