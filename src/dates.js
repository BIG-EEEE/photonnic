// Calendar dates are local wall-clock days, stored as "YYYY-MM-DD" keys.
// Never derive a key from toISOString(): that is UTC and shifts the day near midnight.
export const pad = (n) => String(n).padStart(2, "0");
export const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const keyOf = (date) => key(date.getFullYear(), date.getMonth(), date.getDate());
export const todayKey = (now = new Date()) => keyOf(now);
export const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };

/* EXIF dates are wall-clock text without a time zone, e.g. "2026:10:03 18:20:00",
 * which is the day as the photographer lived it. Returns { key, at } or null. */
export function exifDate(text) {
  if (typeof text !== "string") return null;
  const m = text.trim().match(/^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  const date = new Date(+y, +mo - 1, +d);
  // Reject impossible dates ("2026:02:31", "0000:00:00") instead of letting Date roll them over.
  if (date.getFullYear() !== +y || date.getMonth() !== +mo - 1 || date.getDate() !== +d) return null;
  return { key: `${y}-${mo}-${d}`, at: `${y}-${mo}-${d}T${h}:${mi}:${s}` };
}

/* A capture date is reliable when it is a real day, not before digital cameras were
 * common and not in the future (a camera with a wrong clock). */
export function reliableKey(k, today = todayKey()) {
  return !!k && k >= "1990-01-01" && k <= today;
}
