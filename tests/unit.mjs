// Unit tests that need no browser: dates, image sizing, the backup format.
// node tests/unit.mjs   (re-runs the date tests in several time zones)
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import fs from "node:fs";

let failed = 0, passed = 0;
const ok = (cond, label) => { if (cond) passed++; else { failed++; console.log(`FAIL ${label}`); } };
const zone = process.env.TZ || "local";

// ---------- dates, run once per time zone ----------
const { keyOf, todayKey, parseKey, exifDate, reliableKey } = await import("../src/dates.js");
// Just after local midnight and just before: the key is the local wall-clock day.
ok(keyOf(new Date(2026, 9, 9, 0, 5)) === "2026-10-09", `[${zone}] 00:05 is still 9 Oct`);
ok(keyOf(new Date(2026, 9, 9, 23, 55)) === "2026-10-09", `[${zone}] 23:55 is still 9 Oct`);
ok(todayKey(new Date(2026, 2, 29, 2, 30)) === "2026-03-29", `[${zone}] the DST jump night keeps its date`);
ok(todayKey(new Date(2026, 9, 25, 1, 30)) === "2026-10-25", `[${zone}] the DST fall-back night keeps its date`);
ok(todayKey(new Date(2026, 2, 8, 2, 30)) === "2026-03-08", `[${zone}] US spring-forward night keeps its date`);
// parseKey round-trips every day of a year that has two DST changes.
let rt = true;
for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) if (keyOf(parseKey(keyOf(d))) !== keyOf(d)) rt = false;
ok(rt, `[${zone}] every 2026 date round-trips through parseKey`);
ok(keyOf(parseKey("2028-02-29")) === "2028-02-29", `[${zone}] leap day parses`);
// EXIF wall-clock text never shifts with the zone.
ok(exifDate("2026:10:03 23:59:59")?.key === "2026-10-03", `[${zone}] EXIF 23:59 stays on 3 Oct`);
ok(exifDate("2026:10:04 00:00:01")?.key === "2026-10-04", `[${zone}] EXIF 00:00 stays on 4 Oct`);
ok(exifDate("2026:02:31 10:00:00") === null && exifDate("0000:00:00 00:00:00") === null && exifDate(42) === null, `[${zone}] impossible EXIF dates are rejected`);
ok(reliableKey("2026-10-03", "2026-10-09") && !reliableKey("2031-01-01", "2026-10-09") && !reliableKey("1970-01-01", "2026-10-09"), `[${zone}] reliability: past yes, future and 1970 no`);

if (process.env.TZ) { // child run: report and stop
  console.log(JSON.stringify({ passed, failed }));
  process.exit(failed ? 1 : 0);
}
for (const tz of ["Africa/Accra", "Europe/London", "America/New_York", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
  const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TZ: tz }, encoding: "utf8" }).trim().split("\n").pop();
  const r = JSON.parse(out);
  passed += r.passed; failed += r.failed;
  if (r.failed) console.log(`FAIL date tests in ${tz}`);
}

// ---------- image sizing ----------
const { fitLong, fitShort, checkFile } = await import("../src/image.js");
ok(fitLong(4000, 3000, 2048).join() === "2048,1536", "12 MP scales to 2048 on the long side");
ok(fitLong(300, 200, 2048).join() === "300,200", "small images are never upscaled");
ok(fitShort(4000, 3000, 256).join() === "341,256", "thumbnail: 256 on the short side");
ok(fitShort(200, 100, 256).join() === "200,100", "thumbnail never upscales");
const throwsCode = (fn, code) => { try { fn(); return false; } catch (e) { return e.code === code; } };
ok(throwsCode(() => checkFile({ type: "text/plain", name: "notes.txt", size: 10 }), "type"), "a text file is refused");
ok(throwsCode(() => checkFile({ type: "image/jpeg", name: "a.jpg", size: 60 * 1024 * 1024 }), "size"), "a 60 MB file is refused");
ok(throwsCode(() => checkFile({ type: "image/jpeg", name: "a.jpg", size: 0 }), "decode"), "an empty file is refused");
ok(!throwsCode(() => checkFile({ type: "", name: "IMG_1.HEIC", size: 100 }), "type"), "a HEIC with no MIME type is allowed through by name");

// ---------- backup format ----------
const { buildBackup, parseBackup, backupName, sniff, VERSION, LIMITS } = await import("../src/backup.js");
const jpeg = fs.readFileSync("tests/fixtures/plain.jpg"), png = fs.readFileSync("tests/fixtures/small.png");
const days = [
  { date: "2026-10-09", caption: "Lunch on the bench\nwith Ama", takenAt: null, dateSource: "camera", width: 1200, height: 900, createdAt: "2026-10-09T13:00:00.000Z", updatedAt: "2026-10-09T13:00:00.000Z" },
  { date: "2026-10-03", caption: "", takenAt: "2026-10-03T18:20:00", dateSource: "exif", lat: 5.556, lng: -0.182, locationSource: "exif", width: 800, height: 600 },
  { date: "2026-02-28", caption: "PNG day", dateSource: "chosen" },
];
const images = { "2026-10-09": new Blob([jpeg]), "2026-10-03": new Blob([jpeg]), "2026-02-28": new Blob([png]) };
const progress = [];
const blob = await buildBackup(days, async (d) => images[d], { today: "2026-10-09", onProgress: (i, n) => progress.push(`${i}/${n}`) });
const u8 = new Uint8Array(await blob.arrayBuffer());
ok(backupName("2026-10-09") === "photonnic-backup-2026-10-09.zip", "backup file name");
ok(progress.join() === "1/3,2/3,3/3", "export reports progress per photo");
const raw = unzipSync(u8);
const man = JSON.parse(strFromU8(raw["manifest.json"]));
ok(man.format === "photonic-backup" && man.version === VERSION && man.count === 3, "manifest: format, version, count");
ok(Object.keys(raw).sort().join() === "manifest.json,photos/2026-02-28.png,photos/2026-10-03.jpg,photos/2026-10-09.jpg", "archive holds exactly the manifest and one file per day");
ok(Buffer.compare(Buffer.from(raw["photos/2026-10-09.jpg"]), jpeg) === 0, "photos are stored byte for byte");
ok(!JSON.stringify(man).match(/thumb|C:\\|\/Users\//), "manifest has no thumbnails or file-system paths");
const back = parseBackup(u8, { today: "2026-10-09" }).entries;
ok(back.map((e) => e.date).join() === "2026-02-28,2026-10-03,2026-10-09", "round trip: all dates, in order");
const oct3 = back.find((e) => e.date === "2026-10-03"), oct9 = back.find((e) => e.date === "2026-10-09");
ok(oct3.lat === 5.556 && oct3.lng === -0.182 && oct3.locationSource === "exif" && oct3.takenAt === "2026-10-03T18:20:00" && oct3.dateSource === "exif", "round trip: location, capture time, date source");
ok(oct9.caption === "Lunch on the bench\nwith Ama" && oct9.createdAt === "2026-10-09T13:00:00.000Z", "round trip: multi-line caption, created time");
ok(back.find((e) => e.date === "2026-02-28").type === "image/png" && oct9.type === "image/jpeg", "round trip: real image types");

// Hand-made archives, each broken one way. Every one must be refused before any write.
const goodEntry = (date, extra = {}) => ({ date, file: `photos/${date}.jpg`, type: "image/jpeg", bytes: jpeg.length, caption: "", ...extra });
const make = (entries, files = {}, manifest = {}) => zipSync({
  "manifest.json": strToU8(JSON.stringify({ format: "photonic-backup", version: 1, entries, ...manifest })),
  ...Object.fromEntries(entries.filter((e) => e && e.file && !(e.file in files)).map((e) => [e.file, new Uint8Array(jpeg)])),
  ...files,
});
const refused = (u, code, label) => {
  try { parseBackup(u, { today: "2026-10-09" }); ok(false, `${label} (was accepted)`); }
  catch (e) { ok(e.code === code && /Nothing was changed/.test(e.message), `${label} -> ${code}`); }
};
ok(parseBackup(make([goodEntry("2026-10-01")]), { today: "2026-10-09" }).entries.length === 1, "a minimal hand-made backup is accepted");
refused(new Uint8Array(4000).fill(7), "notbackup", "random bytes");
refused(Uint8Array.from([0x50, 0x4b, 3, 4, ...new Array(200).fill(9)]), "corrupt", "a truncated zip");
refused(zipSync({ "photos/2026-10-01.jpg": new Uint8Array(jpeg) }), "notbackup", "a zip with no manifest");
refused(zipSync({ "manifest.json": strToU8("{not json") }), "corrupt", "a manifest that isn't JSON");
refused(make([goodEntry("2026-10-01")], {}, { format: "something-else" }), "notbackup", "a different format");
refused(make([goodEntry("2026-10-01")], {}, { version: 2 }), "version", "a newer version");
refused(make([goodEntry("2026-10-01")], {}, { version: 0 }), "invalid", "version 0");
refused(make([]), "empty", "no entries");
refused(make([goodEntry("2026-10-01"), goodEntry("2026-10-01")]), "duplicate", "two photos for one day");
refused(make([goodEntry("2026-10-01")], { "photos/2026-10-01.jpg": undefined }), "missing", "a missing photo file");
refused(zipSync({ "manifest.json": strToU8(JSON.stringify({ format: "photonic-backup", version: 1, entries: [goodEntry("2026-10-01")] })) }), "missing", "a manifest that names an absent file");
refused(make([goodEntry("2026-02-30", { file: "photos/2026-02-30.jpg" })]), "invalid", "an impossible date");
refused(make([goodEntry("2031-01-01", { file: "photos/2031-01-01.jpg" })]), "invalid", "a date in the future");
refused(make([goodEntry("2026-10-01", { location: { lat: 123, lng: 0 } })]), "invalid", "a latitude out of range");
refused(make([goodEntry("2026-10-01", { caption: { evil: true } })]), "invalid", "a caption that isn't text");
refused(make([goodEntry("2026-10-01", { caption: "x".repeat(LIMITS.caption + 1) })]), "invalid", "an overlong caption");
refused(make([goodEntry("2026-10-01", { takenAt: "yesterday" })]), "invalid", "a malformed capture time");
refused(make([goodEntry("2026-10-01", { file: "photos/2026-10-02.jpg" })]), "invalid", "a file name that doesn't match its date");
refused(make([goodEntry("2026-10-01", { file: "../2026-10-01.jpg" })], { "../2026-10-01.jpg": new Uint8Array(jpeg) }), "unsafe", "a path that climbs out (../)");
refused(make([goodEntry("2026-10-01")], { "/etc/passwd": strToU8("x") }), "unsafe", "an absolute path");
refused(make([goodEntry("2026-10-01")], { "photos\\..\\x.jpg": strToU8("x") }), "unsafe", "a backslash path");
refused(make([goodEntry("2026-10-01")], { "photos/2026-10-01.jpg": strToU8("this is not a jpeg at all") }), "image", "a photo that isn't an image");
refused(make([goodEntry("2026-10-01")], { "photos/2026-10-01.jpg": new Uint8Array(LIMITS.imageBytes + 10) }), "toolarge", "a 25 MB+ file (zip bomb guard)");
refused(new Uint8Array(LIMITS.archiveBytes + 1), "toolarge", "an archive over the size limit");
const many = {}; for (let i = 0; i <= LIMITS.files + 1; i++) many[`photos/x${i}.jpg`] = new Uint8Array(1);
refused(zipSync({ "manifest.json": strToU8("{}"), ...many }), "toolarge", "more files than allowed");
ok(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0])) === "image/jpeg" && sniff(new Uint8Array([1, 2, 3, 4])) === null, "image type comes from the bytes");

console.log(`unit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
