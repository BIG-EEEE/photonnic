/* Photonnic service worker additions: show the daily reminder, open the app from it,
 * and keep the subscription alive when the browser renews it. Imported into the
 * generated service worker (vite.config.js, workbox.importScripts). */

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(d.title || "A moment for today", {
    body: d.body || "Capture one photo to keep today’s memory.",
    icon: "/icons/icon-192.png",
    tag: "photonic-daily", // a newer reminder replaces an older one
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); return; }
    }
    await self.clients.openWindow(url);
  })());
});

// The browser replaced the push subscription: hand the new one to the reminder server,
// using the id and token the app saved in its own database.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    const state = await new Promise((resolve) => {
      const r = indexedDB.open("photonic");
      r.onerror = () => resolve(null);
      r.onsuccess = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("settings")) { db.close(); return resolve(null); }
        const q = db.transaction("settings").objectStore("settings").get("reminder");
        q.onsuccess = () => { db.close(); resolve(q.result?.value || null); };
        q.onerror = () => { db.close(); resolve(null); };
      };
    });
    if (!state?.enabled) return;
    const key = (await (await fetch("/api/key")).json()).key;
    const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (key.length % 4)) % 4));
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
    const j = sub.toJSON();
    await fetch("/api/preferences", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: state.id, token: state.token, time: state.time, tz: state.tz, aware: !!state.aware, subscription: { endpoint: j.endpoint, keys: j.keys } }),
    });
  })());
});
