/* Daily reminders through Web Push (M6).
 *
 * The reminder server (server/) receives only what delivery needs: the browser's push
 * address and keys, the reminder time and the time zone, and, only if the user turns
 * on "skip once today's photo is in", the date of the latest photo. Never photos,
 * captions, locations or anything else from the journal.
 *
 * The journal never depends on this module: every call here can fail without
 * touching a saved photo.
 */
const API = "/api/";

export class ReminderError extends Error {
  constructor(code, status) { super(MESSAGES[code] || MESSAGES.server); this.code = code; this.status = status; }
}
const MESSAGES = {
  offline: "Couldn’t reach the reminder service, so nothing changed. Check your connection and try again.",
  server: "The reminder service had a problem, so nothing changed. Try again in a moment.",
  busy: "Too many tries. Wait a few minutes and try again.",
  expired: "This phone’s reminder was removed. Turn reminders on again.",
  denied: "Notifications are blocked for Photonnic. Allow them in your phone or browser settings, then turn reminders on.",
  dismissed: "Notifications weren’t allowed, so reminders are still off.",
  unsupported: "This browser can’t show reminders.",
};

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

/* "ok", "ios-install" (iPhone/iPad outside the Home Screen app), "unsupported" or "denied". */
export function support() {
  const push = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !standalone()) return "ios-install";
  if (!push) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

async function call(route, body) {
  let r;
  try {
    r = await fetch(API + route, body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" }
      : { cache: "no-store" });
  } catch { throw new ReminderError("offline"); }
  let j = null;
  try { j = await r.json(); } catch {}
  if (r.ok && j?.ok) return j;
  if (r.status === 404 && body?.token) throw new ReminderError("expired", 404);
  throw new ReminderError(r.status === 429 ? "busy" : "server", r.status);
}

const bytes = (b64) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const sameKey = (sub, key) => {
  const a = sub.options?.applicationServerKey;
  if (!a) return false;
  const x = new Uint8Array(a), y = bytes(key);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
const subJSON = (sub) => { const j = sub.toJSON(); return { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } }; };

/* Turn reminders on. Must be called straight from the tap: the permission prompt
 * needs that tap. Resolves to the state to keep on the phone. */
export async function enable({ time, aware }) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new ReminderError(perm === "denied" ? "denied" : "dismissed");
  const reg = await navigator.serviceWorker.ready;
  const { key } = await call("key");
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  sub = sub || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) }));
  const tz = zone();
  try {
    const { id, token } = await call("subscribe", { subscription: subJSON(sub), time, tz, aware: !!aware });
    return { enabled: true, id, token, time, tz, aware: !!aware, doneSent: null };
  } catch (e) {
    await sub.unsubscribe().catch(() => {}); // never leave a subscription the server doesn't know
    throw e;
  }
}

export async function update(state, changes) {
  const next = { ...state, ...changes, tz: changes.tz || zone() };
  await call("preferences", { id: next.id, token: next.token, time: next.time, tz: next.tz, aware: !!next.aware });
  if (!next.aware) next.doneSent = null;
  return next;
}

/* Turn reminders off. The browser's subscription is removed even if the server can't be
 * reached: the push service then answers "gone" and the server deletes its row. */
export async function disable(state) {
  let serverOk = true;
  try { await call("unsubscribe", { id: state.id, token: state.token }); } catch (e) { serverOk = e.code === "expired"; }
  try { const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); await sub?.unsubscribe(); } catch {}
  return { serverOk };
}

/* Tell the server the latest photo date (or null), only when skip-when-done is on. */
export async function reportDone(state, date) {
  if (!state?.enabled || !state.aware) return state;
  await call("done", { id: state.id, token: state.token, date });
  return { ...state, doneSent: date };
}

/* On start: is the browser subscription still there, and has the time zone changed? */
export async function check(state) {
  if (!state?.enabled) return state;
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!sub) return { ...state, enabled: false, lost: true };
    if (state.tz !== zone()) return await update(state, { tz: zone() });
  } catch (e) {
    if (e.code === "expired") return { ...state, enabled: false, lost: true };
  }
  return state;
}
