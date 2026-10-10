/* On-device storage for the journal. Nothing here touches the network.
 *
 * IndexedDB "photonic", version 1:
 *   days      key: date ("YYYY-MM-DD")  metadata + thumbnail Blob. The key IS the
 *             one-photo-per-day rule: a second add() for a date fails.
 *   images    key: date                 the full-size Blob, read only when shown
 *   undo      key: date                 the photo a replacement displaced, kept until
 *             Undo or until it is older than UNDO_MS
 *   settings  key: key                  small preferences
 *
 * Every write that touches more than one store runs in one transaction, so a crash or a
 * rejected write leaves either the old state or the new one, never half of each.
 * The demo (?demo) uses createMemoryStore instead and never opens this database.
 */
import { openDB } from "idb";

export const DB_NAME = "photonic";
export const DB_VERSION = 1;
const UNDO_MS = 10 * 60 * 1000;

export class StoreError extends Error {
  constructor(code, message, cause) { super(message); this.code = code; this.cause = cause; }
}
const MESSAGES = {
  quota: "Your phone is out of space for Photonnic. Free up some space and try again.",
  exists: "This day already has a photo.",
  missing: "That photo isn’t saved any more.",
  expired: "It’s too late to undo that.",
  unavailable: "This browser isn’t letting Photonnic save photos. Try opening it outside private browsing.",
  failed: "Couldn’t save that change. Try again.",
};
export const storeError = (code, cause) => new StoreError(code, MESSAGES[code], cause);
function wrap(e) {
  if (e instanceof StoreError) return e;
  const name = e?.name || e?.target?.error?.name || "";
  if (name === "QuotaExceededError" || /quota/i.test(e?.message || "")) return storeError("quota", e);
  if (name === "ConstraintError") return storeError("exists", e);
  return storeError("failed", e);
}

function upgrade(db, oldVersion) {
  // Each version only adds; earlier steps stay as written so any old install can climb.
  if (oldVersion < 1) {
    db.createObjectStore("days", { keyPath: "date" });
    db.createObjectStore("images", { keyPath: "date" });
    db.createObjectStore("undo", { keyPath: "date" });
    db.createObjectStore("settings", { keyPath: "key" });
  }
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/* Split what the UI hands in into the stored day record and the full image. */
function toRecord(input, prev) {
  const now = new Date().toISOString();
  const { image, ...rest } = input;
  return {
    day: {
      schema: 1,
      id: newId(),
      date: rest.date,
      thumb: rest.thumb,
      width: rest.width ?? null,
      height: rest.height ?? null,
      caption: rest.caption || "",
      takenAt: rest.takenAt || null,        // wall-clock capture time from EXIF, if any
      dateSource: rest.dateSource || "today", // camera | exif | chosen | today
      lat: rest.lat ?? null,
      lng: rest.lng ?? null,
      locationSource: rest.lat != null ? rest.locationSource : null, // exif | device
      createdAt: rest.createdAt || prev?.createdAt || now,
      updatedAt: rest.updatedAt || now,
    },
    image: { date: rest.date, blob: image },
  };
}

export async function openIdbStore(name = DB_NAME) {
  let db;
  try {
    db = await openDB(name, DB_VERSION, {
      upgrade,
      // Another tab opened a newer version: step aside so its upgrade can run.
      blocking() { db.close(); },
    });
  } catch (e) {
    throw storeError("unavailable", e);
  }

  const run = async (stores, fn) => {
    const tx = db.transaction(stores, "readwrite");
    try {
      const result = await fn(tx);
      await tx.done;
      return result;
    } catch (e) {
      try { tx.abort(); } catch {}
      await tx.done.catch(() => {});
      throw wrap(e);
    }
  };

  const store = {
    kind: "idb",
    name,
    async list() { return db.getAll("days"); }, // sorted by date
    async get(date) { return db.get("days", date); },
    async getImage(date) { return (await db.get("images", date))?.blob || null; },

    /* A new photo for an empty day. Fails with code "exists" if the day has one. */
    async add(input) {
      const { day, image } = toRecord(input);
      return run(["days", "images"], async (tx) => {
        await tx.objectStore("days").add(day);
        await tx.objectStore("images").add(image);
        return day;
      });
    },

    /* Replace a day's photo, keeping the old one for Undo. Returns { day, previous }. */
    async replace(input) {
      return run(["days", "images", "undo"], async (tx) => {
        const days = tx.objectStore("days"), images = tx.objectStore("images");
        const prevDay = await days.get(input.date);
        if (!prevDay) throw storeError("missing");
        const prevImage = await images.get(input.date);
        const { day, image } = toRecord(input, prevDay);
        await tx.objectStore("undo").put({ date: input.date, day: prevDay, image: prevImage, at: Date.now() });
        await days.put(day);
        await images.put(image);
        return { day, previous: prevDay };
      });
    },

    /* Put back the photo a replacement displaced. Returns the restored day. */
    async undo(date) {
      return run(["days", "images", "undo"], async (tx) => {
        const u = await tx.objectStore("undo").get(date);
        if (!u || Date.now() - u.at > UNDO_MS) throw storeError("expired");
        await tx.objectStore("days").put(u.day);
        if (u.image) await tx.objectStore("images").put(u.image);
        await tx.objectStore("undo").delete(date);
        return u.day;
      });
    },

    /* Restore many days in ONE transaction: all of them land, or (quota, crash, any
     * failure) none do. mode "keep" skips days that already have a photo; "replace"
     * overwrites them. Returns { added, replaced, kept }. */
    async importMany(inputs, mode = "keep") {
      return run(["days", "images"], async (tx) => {
        const days = tx.objectStore("days"), images = tx.objectStore("images");
        const n = { added: 0, replaced: 0, kept: 0 };
        for (const input of inputs) {
          const existing = await days.get(input.date);
          if (existing && mode !== "replace") { n.kept++; continue; }
          const { day, image } = toRecord(input, existing);
          await days.put(day);
          await images.put(image);
          existing ? n.replaced++ : n.added++;
        }
        return n;
      });
    },

    async setCaption(date, caption) {
      return run(["days"], async (tx) => {
        const days = tx.objectStore("days");
        const day = await days.get(date);
        if (!day) throw storeError("missing");
        const next = { ...day, caption, updatedAt: new Date().toISOString() };
        await days.put(next);
        return next;
      });
    },

    async setThumb(date, thumb) {
      return run(["days"], async (tx) => {
        const days = tx.objectStore("days");
        const day = await days.get(date);
        if (day) await days.put({ ...day, thumb });
        return day ? { ...day, thumb } : null;
      });
    },

    async remove(date) {
      return run(["days", "images", "undo"], async (tx) => {
        await tx.objectStore("days").delete(date);
        await tx.objectStore("images").delete(date);
        await tx.objectStore("undo").delete(date);
      });
    },

    async clear() {
      return run(["days", "images", "undo"], async (tx) => {
        await tx.objectStore("days").clear();
        await tx.objectStore("images").clear();
        await tx.objectStore("undo").clear();
      });
    },

    async getSetting(key, fallback = null) { return (await db.get("settings", key))?.value ?? fallback; },
    async setSetting(key, value) { return run(["settings"], (tx) => tx.objectStore("settings").put({ key, value })); },

    /* Drop Undo copies nobody can use any more. */
    async pruneUndo() {
      return run(["undo"], async (tx) => {
        const s = tx.objectStore("undo");
        for (const u of await s.getAll()) if (Date.now() - u.at > UNDO_MS) await s.delete(u.date);
      });
    },

    close() { db.close(); },
  };
  await store.pruneUndo().catch(() => {});
  return store;
}

/* Ask the browser not to evict our data under storage pressure. Not a backup:
 * the user can still clear site data, and a lost phone loses the journal. */
export async function requestPersistence() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return !!(await navigator.storage?.persist?.());
  } catch { return false; }
}

/* Same API, kept in memory. Used by ?demo (seeded with the sample journal) and as a
 * last resort when IndexedDB is unavailable. Never touches the real database. */
export function createMemoryStore(initial = []) {
  let days = new Map(), images = new Map(), undo = new Map(), settings = new Map();
  const load = (records) => {
    days = new Map(); images = new Map(); undo = new Map();
    for (const r of records) { const { image, ...day } = r; days.set(day.date, day); images.set(day.date, image); }
  };
  load(initial);
  const sorted = () => [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    kind: "memory",
    async list() { return sorted(); },
    async get(date) { return days.get(date); },
    async getImage(date) { return images.get(date) || null; },
    async add(input) {
      if (days.has(input.date)) throw storeError("exists");
      const { day, image } = toRecord(input);
      days.set(day.date, day); images.set(day.date, image.blob);
      return day;
    },
    async replace(input) {
      const prev = days.get(input.date);
      if (!prev) throw storeError("missing");
      undo.set(input.date, { day: prev, image: images.get(input.date) });
      const { day, image } = toRecord(input, prev);
      days.set(day.date, day); images.set(day.date, image.blob);
      return { day, previous: prev };
    },
    async undo(date) {
      const u = undo.get(date);
      if (!u) throw storeError("expired");
      days.set(date, u.day); images.set(date, u.image); undo.delete(date);
      return u.day;
    },
    async setCaption(date, caption) {
      const d = days.get(date); if (!d) throw storeError("missing");
      const next = { ...d, caption }; days.set(date, next); return next;
    },
    async setThumb(date, thumb) { const d = days.get(date); if (d) days.set(date, { ...d, thumb }); return days.get(date) || null; },
    async importMany(inputs, mode = "keep") {
      const n = { added: 0, replaced: 0, kept: 0 };
      for (const input of inputs) {
        const existing = days.get(input.date);
        if (existing && mode !== "replace") { n.kept++; continue; }
        const { day, image } = toRecord(input, existing);
        days.set(day.date, day); images.set(day.date, image.blob);
        existing ? n.replaced++ : n.added++;
      }
      return n;
    },
    async remove(date) { days.delete(date); images.delete(date); undo.delete(date); },
    async clear() { days.clear(); images.clear(); undo.clear(); },
    async getSetting(key, fallback = null) { return settings.has(key) ? settings.get(key) : fallback; },
    async setSetting(key, value) { settings.set(key, value); },
    async pruneUndo() {},
    reset(records) { load(records); },
    close() {},
  };
}
