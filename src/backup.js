/* Photonic backups: a ZIP made and read entirely on the device.
 *
 *   photonic-backup-2026-10-09.zip
 *     photos/2026-10-03.jpg        the saved full image, byte for byte (stored, not recompressed)
 *     photos/2026-10-09.jpg
 *     manifest.json                format, version and one entry per day
 *
 *   manifest.json
 *   { "format": "photonic-backup", "version": 1, "createdAt": "2026-10-09T15:20:00.000Z",
 *     "app": "Photonic 1.0", "count": 2,
 *     "entries": [ { "date": "2026-10-03", "file": "photos/2026-10-03.jpg", "type": "image/jpeg",
 *                    "bytes": 182311, "caption": "…", "takenAt": "2026-10-03T18:20:00" | null,
 *                    "dateSource": "exif", "location": { "lat": 5.556, "lng": -0.182, "source": "exif" } | null,
 *                    "width": 800, "height": 600, "createdAt": "…", "updatedAt": "…" } ] }
 *
 * The format is its own contract, not a dump of the database: thumbnails and internal
 * ids are left out and rebuilt on restore. A newer version is refused with a clear message;
 * older versions will be upgraded in migrate() when version 2 exists.
 *
 * Everything read from an archive is untrusted. parseBackup() checks the whole archive
 * before anything is written, so a bad file can never touch the journal.
 */
import { Zip, ZipPassThrough, ZipDeflate, unzipSync, strToU8, strFromU8 } from "fflate";

export const FORMAT = "photonic-backup";
export const VERSION = 1;
export const LIMITS = {
  archiveBytes: 600 * 1024 * 1024, // what a phone can read into memory safely
  totalBytes: 1024 * 1024 * 1024,  // sum of uncompressed sizes
  imageBytes: 25 * 1024 * 1024,    // one photo
  files: 5000,                     // about 13 years of days
  caption: 2000,
};

export class BackupError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const NOTHING = "Nothing was changed.";
const fail = (code, message) => { throw new BackupError(code, message); };

export const backupName = (today) => `photonic-backup-${today}.zip`;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const SOURCES = new Set(["camera", "exif", "chosen", "today"]);

/* What the bytes really are, ignoring names and declared types. */
export function sniff(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

function realDate(k) {
  const m = DATE.exec(k || "");
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}
const nextDay = (k) => { const [y, m, d] = k.split("-").map(Number); const t = new Date(y, m - 1, d + 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const dm = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "long" }); };

// ---------- Export ----------

/* days: stored day records (sorted or not). getImage(date) -> Blob | URL string.
 * Returns a Blob of the whole archive. */
export async function buildBackup(days, getImage, { today, now = new Date(), onProgress } = {}) {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const chunks = [];
  let failed = null;
  const zip = new Zip((err, chunk) => { if (err) failed = err; else chunks.push(chunk); });
  const entries = [];
  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i];
    let img = await getImage(day.date);
    if (typeof img === "string") img = await (await fetch(img)).blob(); // demo photos are URLs
    if (!img) fail("unreadable", `The photo for ${dm(day.date)} couldn’t be read, so no backup was made.`);
    const bytes = new Uint8Array(await img.arrayBuffer());
    const type = sniff(bytes);
    if (!type) fail("unreadable", `The photo for ${dm(day.date)} couldn’t be read, so no backup was made.`);
    const file = `photos/${day.date}.${EXT[type]}`;
    const f = new ZipPassThrough(file); // JPEGs are already compressed
    zip.add(f);
    f.push(bytes, true);
    entries.push({
      date: day.date, file, type, bytes: bytes.length,
      caption: day.caption || "",
      takenAt: day.takenAt || null,
      dateSource: day.dateSource || null,
      location: day.lat != null && day.lng != null ? { lat: day.lat, lng: day.lng, source: day.locationSource || null } : null,
      width: day.width ?? null, height: day.height ?? null,
      createdAt: day.createdAt || null, updatedAt: day.updatedAt || null,
    });
    onProgress?.(i + 1, sorted.length);
    await new Promise((r) => setTimeout(r)); // let the progress message paint
  }
  const manifest = { format: FORMAT, version: VERSION, createdAt: now.toISOString(), app: "Photonic 1.0", count: entries.length, today: today || null, entries };
  const m = new ZipDeflate("manifest.json", { level: 6 });
  zip.add(m);
  m.push(strToU8(JSON.stringify(manifest, null, 2)), true);
  zip.end();
  if (failed) throw new BackupError("failed", "The backup couldn’t be made. Try again.");
  return new Blob(chunks, { type: "application/zip" });
}

// ---------- Restore ----------

const UNSAFE = (name) => !name || name.startsWith("/") || name.includes("\\") || name.includes("..") || /[\x00-\x1f]|^[a-z]:/i.test(name);

/* Older formats are lifted to the current shape here. Version 1 is current. */
function migrate(manifest) {
  return manifest;
}

/* Reads and checks an archive. Returns { manifest, entries } where each entry carries its
 * image bytes. Throws BackupError, and never has side effects. */
export function parseBackup(u8, { today } = {}) {
  if (!(u8 instanceof Uint8Array) || u8.length < 22) fail("notbackup", `That file isn’t a Photonic backup. ${NOTHING}`);
  if (u8.length > LIMITS.archiveBytes) fail("toolarge", `That backup is too large to restore on this phone. ${NOTHING}`);
  if (!(u8[0] === 0x50 && u8[1] === 0x4b)) fail("notbackup", `That file isn’t a Photonic backup. ${NOTHING}`);

  let files, count = 0, total = 0;
  try {
    files = unzipSync(u8, {
      filter(f) {
        if (UNSAFE(f.name)) fail("unsafe", `That backup contains files Photonic won’t open. ${NOTHING}`);
        if (++count > LIMITS.files + 1) fail("toolarge", `That backup has too many files. ${NOTHING}`);
        const limit = f.name === "manifest.json" ? 20 * 1024 * 1024 : LIMITS.imageBytes;
        if (f.originalSize > limit) fail("toolarge", `A file in that backup is too large. ${NOTHING}`);
        total += f.originalSize;
        if (total > LIMITS.totalBytes) fail("toolarge", `That backup is too large to restore on this phone. ${NOTHING}`);
        return f.name === "manifest.json" || f.name.startsWith("photos/");
      },
    });
  } catch (e) {
    if (e instanceof BackupError) throw e;
    fail("corrupt", `That backup is damaged and can’t be read. ${NOTHING}`);
  }

  if (!files["manifest.json"]) fail("notbackup", `That file isn’t a Photonic backup. ${NOTHING}`);
  let manifest;
  try { manifest = JSON.parse(strFromU8(files["manifest.json"])); } catch { fail("corrupt", `That backup is damaged and can’t be read. ${NOTHING}`); }
  if (!manifest || manifest.format !== FORMAT) fail("notbackup", `That file isn’t a Photonic backup. ${NOTHING}`);
  if (!Number.isInteger(manifest.version) || manifest.version < 1) fail("invalid", `That backup has a problem (unknown version). ${NOTHING}`);
  if (manifest.version > VERSION) fail("version", `That backup was made by a newer version of Photonic. Update the app, then try again. ${NOTHING}`);
  manifest = migrate(manifest);
  if (!Array.isArray(manifest.entries)) fail("invalid", `That backup has a problem (no list of photos). ${NOTHING}`);
  if (!manifest.entries.length) fail("empty", `That backup has no photos in it. ${NOTHING}`);
  if (manifest.entries.length > LIMITS.files) fail("toolarge", `That backup has too many photos. ${NOTHING}`);

  const latest = today ? nextDay(today) : null; // a day of slack for time-zone travel
  const seen = new Set(), entries = [];
  for (const e of manifest.entries) {
    const bad = (what) => fail("invalid", `That backup has a problem (${what}). ${NOTHING}`);
    if (!e || typeof e !== "object") bad("an unreadable entry");
    if (!realDate(e.date)) bad(`a date that doesn’t exist: ${String(e.date).slice(0, 20)}`);
    if (latest && e.date > latest) bad(`a photo dated in the future, ${dm(e.date)}`);
    if (seen.has(e.date)) fail("duplicate", `That backup has two photos for ${dm(e.date)}. ${NOTHING}`);
    seen.add(e.date);
    const m = /^photos\/(\d{4}-\d{2}-\d{2})\.(jpg|png|webp)$/.exec(e.file || "");
    if (!m || m[1] !== e.date) bad(`an unexpected file name for ${dm(e.date)}`);
    if (e.caption != null && typeof e.caption !== "string") bad(`the caption for ${dm(e.date)}`);
    if ((e.caption || "").length > LIMITS.caption) bad(`the caption for ${dm(e.date)} is too long`);
    if (e.takenAt != null && !(typeof e.takenAt === "string" && STAMP.test(e.takenAt))) bad(`the capture time for ${dm(e.date)}`);
    let loc = null;
    if (e.location != null) {
      const { lat, lng, source } = e.location;
      if (!(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180)) bad(`the location for ${dm(e.date)}`);
      loc = { lat, lng, locationSource: source === "device" ? "device" : "exif" };
    }
    const bytes = files[e.file];
    if (!bytes) fail("missing", `That backup is missing the photo for ${dm(e.date)}. ${NOTHING}`);
    if (!bytes.length || bytes.length > LIMITS.imageBytes) bad(`the photo for ${dm(e.date)}`);
    const type = sniff(bytes);
    if (!type) fail("image", `The photo for ${dm(e.date)} in that backup isn’t an image Photonic can open. ${NOTHING}`);
    const stamp = (v) => (typeof v === "string" && STAMP.test(v) ? v : null);
    entries.push({
      date: e.date, type, bytes,
      caption: (e.caption || "").replace(/\r\n?/g, "\n"),
      takenAt: e.takenAt || null,
      dateSource: SOURCES.has(e.dateSource) ? e.dateSource : "chosen",
      createdAt: stamp(e.createdAt), updatedAt: stamp(e.updatedAt),
      ...(loc ? { lat: loc.lat, lng: loc.lng, locationSource: loc.locationSource } : {}),
    });
  }
  entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { manifest, entries };
}
