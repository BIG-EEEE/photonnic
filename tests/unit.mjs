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

console.log(`unit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
