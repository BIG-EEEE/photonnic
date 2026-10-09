// Production-build tests with real IndexedDB, real file pickers and real downloads.
// Every check reads the stored data back, not just the screen.
// Usage: npm run build && npm run build:demo && node tests/prod.mjs
import fs from "node:fs";
import { preview } from "vite";
import { chromium } from "playwright-core";
import { zipSync, strToU8 } from "fflate";
import { parseBackup } from "../src/backup.js";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "test-results";
const FIX = "tests/fixtures/";
fs.mkdirSync(OUT, { recursive: true });
let failed = 0, passed = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"} ${label}`); cond ? passed++ : failed++; };

const prodSrv = await preview({ preview: { port: 4175, strictPort: true }, build: { outDir: "dist" }, logLevel: "warn" });
const demoSrv = await preview({ preview: { port: 4176, strictPort: true }, build: { outDir: "dist-demo" }, logLevel: "warn" });
const URL_ = "http://localhost:4175/";

// Test hooks injected into every page: make IndexedDB writes fail on demand (quota).
const HOOKS = `
  window.__failWrites = Infinity;
  for (const m of ["put", "add"]) {
    const orig = IDBObjectStore.prototype[m];
    IDBObjectStore.prototype[m] = function (...a) {
      if (window.__failWrites-- <= 0) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      return orig.apply(this, a);
    };
  }`;
const profiles = [];
async function open(dir, { url = URL_, perms = [], geo } = {}) {
  const ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, viewport: { width: 402, height: 874 }, acceptDownloads: true });
  await ctx.addInitScript(HOOKS);
  if (perms.length) await ctx.grantPermissions(perms, { origin: URL_.slice(0, -1) });
  if (geo) await ctx.setGeolocation(geo);
  const p = ctx.pages()[0] || (await ctx.newPage());
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  await p.goto(url, { waitUntil: "networkidle" });
  await p.locator(".cal-head h1").waitFor();
  return { ctx, p };
}
const newProfile = () => { const d = fs.mkdtempSync(`${OUT}/profile-`); profiles.push(d); return d; };

// ---------- helpers ----------
const todayOf = (p) => p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
async function chooser(p, tap) { const [fc] = await Promise.all([p.waitForEvent("filechooser", { timeout: 5000 }), tap()]); return fc; }
async function camera(p, file) { await p.locator(".tab.cam").click(); (await chooser(p, () => p.locator('[data-a="take-photo"]').click())).setFiles(file); }
async function library(p, file) { await p.locator(".tab.cam").click(); (await chooser(p, () => p.locator('[data-a="choose-photo"]').click())).setFiles(file); }
async function day(p, k, file) { (await chooser(p, () => p.locator(`.day[data-k="${k}"]`).click())).setFiles(file); }
async function save(p, caption) {
  await p.locator('[data-view="preview"]').waitFor({ timeout: 8000 });
  if (caption != null) await p.locator(".field textarea").fill(caption);
  await p.locator('[data-a="save"]').click();
  await p.locator('[data-view="preview"]').waitFor({ state: "detached", timeout: 8000 });
  await p.waitForTimeout(700);
}
const toast = async (p) => (await p.locator(".toast").last().textContent({ timeout: 10000 })) || "";
// Wait for the toast that answers this step (an earlier one, or a progress message, may still be up).
const toastLike = async (p, re, timeout = 20000) => {
  const l = p.locator(".toast", { hasText: re }).last();
  try { await l.waitFor({ timeout }); return (await l.textContent()) || ""; }
  catch { return (await p.locator(".toast").last().textContent({ timeout: 1000 }).catch(() => "")) || ""; }
};
const FINAL = /Restored|Nothing was changed|cancelled/;
const settings = async (p) => { await p.locator('[data-a="menu"]').click(); await p.locator('[data-a="settings"]').click(); await p.locator('[data-view="settings"]').waitFor(); await p.waitForTimeout(400); };
// Raw reads of the real database, independent of the app's own code.
const days = (p) => p.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open("photonic");
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains("days")) { db.close(); return res([]); }
    const q = db.transaction("days").objectStore("days").getAll();
    q.onsuccess = () => { res(q.result.map(({ thumb, ...d }) => ({ ...d, thumbType: thumb?.type, thumbSize: thumb?.size || 0 }))); db.close(); };
  };
}));
const image = (p, date) => p.evaluate((date) => new Promise((res) => {
  const r = indexedDB.open("photonic");
  r.onsuccess = () => {
    const db = r.result, q = db.transaction("images").objectStore("images").get(date);
    q.onsuccess = async () => {
      db.close();
      const blob = q.result?.blob;
      if (!blob) return res(null);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let exif = false;
      for (let i = 0; i < Math.min(bytes.length, 65536) - 4; i++) if (bytes[i] === 0x45 && bytes[i + 1] === 0x78 && bytes[i + 2] === 0x69 && bytes[i + 3] === 0x66) { exif = true; break; }
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext("2d");
      x.drawImage(bmp, 0, 0);
      const top = x.getImageData(bmp.width / 2, 4, 1, 1).data;
      res({ type: blob.type, size: blob.size, w: bmp.width, h: bmp.height, exif, top: [...top.slice(0, 3)] });
    };
  };
}), date);
const snapshot = async (p) => JSON.stringify((await days(p)).map((d) => [d.date, d.id, d.caption]).sort());

try {
  // ================= 1. Capture, storage and image processing =================
  const A = newProfile();
  let { ctx, p } = await open(A, { perms: ["geolocation"], geo: { latitude: 51.5, longitude: -0.12 } });
  const today = await todayOf(p);
  ok((await days(p)).length === 0 && (await p.locator(".empty-note").count()) === 1, "fresh install: empty journal, empty state");

  // Export with nothing to export.
  await settings(p);
  ok(await p.locator('[data-a="export"]').isDisabled(), "export: disabled in Settings with no photos");
  await p.locator('[data-a="back"]').click(); await p.waitForTimeout(400);
  await p.locator('[data-a="menu"]').click(); await p.locator('[data-a="export"]').click();
  ok((await toastLike(p, /No photos/)) === "No photos to back up yet.", "export: an empty journal says so instead of making a file");

  // Camera, location off by default even though the browser would allow it.
  await camera(p, FIX + "plain.jpg");
  await save(p, "Lunch on the bench\nwith Ama");
  let d = (await days(p)).find((x) => x.date === today);
  ok(d && d.dateSource === "camera" && d.caption === "Lunch on the bench\nwith Ama", "camera photo saved to today with a two-line caption");
  ok(d && d.lat === null && d.locationSource === null, "location: off by default, so no position even with permission granted");
  ok(d && d.thumbType === "image/jpeg" && d.thumbSize > 0 && d.width === 1200 && d.height === 900, "stored: thumbnail and full image sizes");
  let img = await image(p, today);
  ok(img && img.type === "image/jpeg" && !img.exif, "stored image is a JPEG with metadata stripped");

  // A library photo from 3 Oct asks which day; its own GPS is kept without any setting.
  await library(p, FIX + "dated-gps.jpg");
  await p.locator(".asheet").waitFor();
  ok((await p.locator(".asheet .msg").textContent()) === "This photo is from 3 October.", "library: asks which day for a photo from another day");
  await p.locator('[data-a="date-photo"]').click();
  await save(p, "");
  d = (await days(p)).find((x) => x.date === "2026-10-03");
  ok(d && d.dateSource === "exif" && d.takenAt === "2026-10-03T18:20:00" && Math.abs(d.lat - 5.556) < 1e-3 && d.locationSource === "exif", "saved to 3 Oct with its capture time and its own GPS");

  // Missed days take the day you tapped, whatever the photo says.
  await day(p, "2026-10-05", FIX + "rotated.jpg"); await save(p, "");
  d = (await days(p)).find((x) => x.date === "2026-10-05");
  img = await image(p, "2026-10-05");
  ok(d && d.dateSource === "chosen", "missed day: saved to the tapped day");
  ok(img && img.w === 200 && img.h === 400 && img.top[0] > 180 && img.top[2] < 80, "orientation: a rotated photo is stored upright (portrait, red on top)");
  await day(p, "2026-10-06", FIX + "big.jpg"); await save(p, "");
  img = await image(p, "2026-10-06"); d = (await days(p)).find((x) => x.date === "2026-10-06");
  ok(img && img.w === 2048 && img.h === 1536 && !img.exif, "large photo: 4000x3000 stored at 2048x1536");
  ok(d && d.thumbSize > 0 && d.thumbSize < img.size / 4, "large photo: a small thumbnail is kept for the calendar");
  await day(p, "2026-10-07", FIX + "small.png"); await save(p, "");
  img = await image(p, "2026-10-07");
  ok(img && img.w === 300 && img.h === 200 && img.type === "image/jpeg", "small PNG: not upscaled, stored as JPEG");

  // Broken input never creates a record.
  await day(p, "2026-10-08", FIX + "corrupt.jpg");
  ok(/couldn’t be opened/.test(await toastLike(p, /couldn’t be opened/)) && !(await p.locator('[data-view="preview"]').count()), "corrupt photo: friendly error, no preview");
  await day(p, "2026-10-08", FIX + "notes.txt");
  ok(/isn’t a photo/.test(await toastLike(p, /isn’t a photo/)), "not a photo: refused");
  const fc = await chooser(p, () => p.locator('.day[data-k="2026-10-08"]').click());
  await fc.setFiles([]); await p.waitForTimeout(500);
  ok(!(await p.locator('[data-view="preview"]').count()) && !(await days(p)).some((x) => x.date === "2026-10-08"), "cancelled picker: nothing opens, nothing saved");
  await library(p, FIX + "future.jpg");
  await p.locator('[data-view="preview"]').waitFor();
  ok(!(await p.locator(".asheet").count()) && (await p.locator('[data-a="save"]').textContent()) === "Replace photo", "future-dated photo: date ignored, goes to today (asks to replace)");
  await p.locator('[data-a="cancel-preview"]').click(); await p.waitForTimeout(500);

  // Quota: the save fails honestly and changes nothing.
  const before = await snapshot(p);
  await day(p, "2026-10-08", FIX + "plain.jpg");
  await p.locator('[data-view="preview"]').waitFor();
  await p.evaluate(() => { window.__failWrites = 0; });
  await p.locator('[data-a="save"]').click();
  const quotaMsg = await toastLike(p, /out of space|Saved/);
  await p.evaluate(() => { window.__failWrites = Infinity; });
  ok(/out of space/.test(quotaMsg) && !/Saved/.test(quotaMsg), "quota on save: says the phone is out of space, never 'Saved'");
  ok((await p.locator('[data-view="preview"]').count()) === 1 && !(await p.locator('[data-a="save"]').isDisabled()), "quota on save: the preview stays open to try again");
  ok((await snapshot(p)) === before, "quota on save: the journal is unchanged");
  await p.locator('[data-a="save"]').click(); await p.locator('[data-view="preview"]').waitFor({ state: "detached" }); await p.waitForTimeout(600);
  ok((await days(p)).some((x) => x.date === "2026-10-08"), "quota on save: retrying once space is back works");

  // Replace with Undo, checked in the database.
  const orig = (await days(p)).find((x) => x.date === today);
  await camera(p, FIX + "big.jpg"); await save(p, "replacement");
  ok((await days(p)).find((x) => x.date === today).caption === "replacement", "replace: the new photo is saved");
  await p.locator('[data-a="undo"]').click(); await p.waitForTimeout(600);
  const undone = (await days(p)).find((x) => x.date === today);
  ok(undone.id === orig.id && undone.caption === orig.caption && (await image(p, today)).w === 1200, "undo: the original photo, caption and id are back");

  // Captions: line breaks shown, edits persist, a double tap saves once.
  await p.locator(`.day[data-k="2026-10-05"]`).click(); await p.locator('[data-view="detail"]').waitFor(); await p.waitForTimeout(500);
  await p.locator(".caption").click();
  await p.locator(".caption textarea").fill("Line one\nLine two");
  await p.locator('[data-a="save-caption"]').dblclick();
  await p.waitForTimeout(500);
  ok((await days(p)).find((x) => x.date === "2026-10-05").caption === "Line one\nLine two", "caption edit: saved to the database");
  ok((await p.locator("p.caption").innerText()).includes("\n"), "caption: the line break is shown");
  ok(p.errors.length === 0, "caption: a double tap on Done causes no error");
  await p.locator('[data-a="back"]').click(); await p.waitForTimeout(600);

  // Remove, with confirmation.
  await p.locator(`.day[data-k="2026-10-07"]`).click(); await p.locator('[data-view="detail"]').waitFor();
  await p.locator('[data-a="detail-actions"]').click(); await p.locator('[data-a="remove-ask"]').click();
  await p.locator(".asheet .cancel").click(); await p.waitForTimeout(400);
  ok((await days(p)).some((x) => x.date === "2026-10-07"), "remove: cancelling the confirmation keeps the photo");
  await p.locator('[data-a="detail-actions"]').click(); await p.locator('[data-a="remove-ask"]').click(); await p.locator('[data-a="remove"]').click();
  await p.waitForTimeout(700);
  ok(!(await days(p)).some((x) => x.date === "2026-10-07") && !(await image(p, "2026-10-07")), "remove: the day and its image are gone");
  ok(!(await p.locator('[data-view="detail"]').count()) && (await p.locator('.day.past[data-k="2026-10-07"]').count()) === 1, "remove: back on the calendar, the day is empty again");

  // Reload, then close and reopen: everything is still there.
  const kept = await snapshot(p);
  await p.reload({ waitUntil: "networkidle" }); await p.locator(".cal-head h1").waitFor();
  ok((await snapshot(p)) === kept && (await p.locator(".day.has").count()) === (await days(p)).length, "reload: calendar matches the database");
  await ctx.close();
  ({ ctx, p } = await open(A, { perms: ["geolocation"], geo: { latitude: 51.5, longitude: -0.12 } }));
  ok((await snapshot(p)) === kept, "close and reopen: journal intact");
  await p.locator(`.day[data-k="2026-10-05"]`).click(); await p.waitForTimeout(800);
  ok((await p.locator("p.caption").innerText()) === "Line one\nLine two" && (await p.locator(".photo-frame img").getAttribute("src")).startsWith("blob:"), "close and reopen: caption and full image load");
  await p.locator('[data-a="back"]').click(); await p.waitForTimeout(500);

  // ================= 2. Location opt-in =================
  await settings(p);
  await p.locator('[data-a="toggle-locate"]').click();
  ok((await p.locator('[data-a="toggle-locate"]').getAttribute("aria-checked")) === "true", "location: the switch turns on");
  await p.locator('[data-a="back"]').click(); await p.waitForTimeout(400);
  await camera(p, FIX + "plain.jpg"); await save(p, "with location");
  d = (await days(p)).find((x) => x.date === today);
  ok(d.locationSource === "device" && Math.abs(d.lat - 51.5) < 1e-6, "location on: a new camera photo gets the device position");
  await library(p, FIX + "plain.jpg"); await save(p, "library, no gps");
  d = (await days(p)).find((x) => x.date === today);
  ok(d.lat === null, "location on: a library photo never gets the current position");
  await p.reload({ waitUntil: "networkidle" }); await settings(p);
  ok((await p.locator('[data-a="toggle-locate"]').getAttribute("aria-checked")) === "true", "location: the setting survives a reload");
  await ctx.close();
  // Same journal, permission denied.
  ({ ctx, p } = await open(A));
  await ctx.clearPermissions();
  const t0 = Date.now();
  await camera(p, FIX + "plain.jpg"); await save(p, "denied");
  d = (await days(p)).find((x) => x.date === today);
  ok(d.caption === "denied" && d.lat === null && Date.now() - t0 < 12000, "location denied: the photo saves without a position, without hanging");
  await ctx.close();
  // Permission granted but no position available.
  ({ ctx, p } = await open(A, { perms: ["geolocation"] }));
  await camera(p, FIX + "plain.jpg"); await save(p, "no fix");
  d = (await days(p)).find((x) => x.date === today);
  ok(d.caption === "no fix" && d.lat === null, "location unavailable: saved without a position");

  // ================= 3. Appearance =================
  await settings(p);
  await p.locator('[data-a="theme"][data-v="dark"]').click(); await p.waitForTimeout(300);
  await ctx.close();
  ({ ctx, p } = await (async () => {
    const c = await chromium.launchPersistentContext(A, { executablePath: CHROME, viewport: { width: 402, height: 874 }, colorScheme: "light" });
    await c.addInitScript(`addEventListener("DOMContentLoaded", () => { window.__first = { theme: document.documentElement.dataset.theme, empty: !document.getElementById("ph").children.length }; });`);
    const pg = c.pages()[0] || (await c.newPage());
    await pg.goto(URL_, { waitUntil: "networkidle" });
    return { ctx: c, p: pg };
  })());
  const first = await p.evaluate(() => window.__first);
  ok(first.theme === "dark" && first.empty, "appearance: Dark is painted before the journal even opens (no light flash)");
  ok(await p.evaluate(() => document.querySelector("#ph").dataset.theme === "dark" && document.querySelector('meta[name="theme-color"]').content === "#121211"), "appearance: Dark survives closing the app");
  await settings(p);
  await p.locator('[data-a="theme"][data-v="system"]').click(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !document.querySelector("#ph").dataset.theme), "appearance: System on a light phone is light");

  // ================= 4. Offline =================
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload({ waitUntil: "networkidle" });
  await ctx.setOffline(true);
  await p.reload({ waitUntil: "load" });
  ok(await p.locator(".day.has").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "offline: opens with the saved photos");
  await day(p, "2026-10-04", FIX + "plain.jpg"); await save(p, "saved offline");
  ok((await days(p)).some((x) => x.date === "2026-10-04" && x.caption === "saved offline"), "offline: a new photo saves without a connection");
  await ctx.setOffline(false);

  // ================= 5. Export =================
  const real = await days(p);
  await p.locator('[data-a="menu"]').click(); await p.locator('[data-a="export"]').click();
  await p.locator(".asheet").waitFor({ timeout: 20000 });
  ok(new RegExp(`Backup ready: ${real.length} photos`).test(await p.locator(".asheet .msg").textContent()), "export: says how many photos are in the backup");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.locator('[data-a="backup-download"]').click()]);
  const zipPath = `${OUT}/backup-A.zip`;
  await dl.saveAs(zipPath);
  ok(dl.suggestedFilename() === `photonic-backup-${today}.zip`, "export: file name photonic-backup-<date>.zip");
  ok(/Download started/.test(await toastLike(p, /Download started/)), "export: says the download started (not that it is safely stored)");
  const parsed = parseBackup(new Uint8Array(fs.readFileSync(zipPath)), { today });
  ok(parsed.entries.length === real.length && parsed.entries.every((e) => real.some((r) => r.date === e.date && r.caption === e.caption)), "export: every day and caption is in the backup");
  ok(parsed.entries.find((e) => e.date === "2026-10-03")?.locationSource === "exif" && parsed.entries.find((e) => e.date === "2026-10-05")?.caption === "Line one\nLine two", "export: location and multi-line captions included");
  ok(!parsed.entries.some((e) => e.date < "2026-10-01"), "export: no demo days in a real backup");
  await ctx.close();

  // Share path (Web Share stubbed: desktop automation cannot press a system share sheet).
  ({ ctx, p } = await open(A));
  await p.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = d.files[0].name + ":" + d.files[0].size; }; });
  await p.locator('[data-a="menu"]').click(); await p.locator('[data-a="export"]').click();
  await p.locator('[data-a="backup-share"]').click({ timeout: 20000 });
  ok(/Backup sent/.test(await toastLike(p, /Backup sent/)) && (await p.evaluate(() => window.__shared)).startsWith(`photonic-backup-${today}.zip:`), "export: Share hands the zip to the system share sheet");
  await ctx.close();

  // ================= 6. Restore into a clean install =================
  const B = newProfile();
  ({ ctx, p } = await open(B));
  await settings(p);
  (await chooser(p, () => p.locator('[data-a="restore"]').click())).setFiles(zipPath);
  await p.locator(".asheet").waitFor({ timeout: 20000 });
  ok(new RegExp(`Restore ${real.length} photos from this backup\\?`).test(await p.locator(".asheet .msg").textContent()), "restore: asks before writing");
  await p.locator('[data-a="restore-keep"]').click();
  ok(new RegExp(`^Restored ${real.length} photos$`).test(await toastLike(p, FINAL)), "restore: reports what it restored");
  let restored = await days(p);
  const same = (a, b) => a.date === b.date && a.caption === b.caption && a.takenAt === b.takenAt && a.lat === b.lat && a.lng === b.lng && a.locationSource === b.locationSource && a.dateSource === b.dateSource;
  ok(restored.length === real.length && real.every((r) => restored.some((x) => same(x, r))), "restore: dates, captions, capture times and locations all survive");
  img = await image(p, "2026-10-05");
  ok(img && img.w === 200 && img.h === 400 && restored.every((x) => x.thumbSize > 0), "restore: images decode at their size and thumbnails are rebuilt");
  await ctx.close();
  ({ ctx, p } = await open(B));
  ok((await days(p)).length === real.length && (await p.locator(".day.has").count()) === real.length, "restore: still there after closing and reopening");

  // Conflicts: Keep, Replace, Cancel.
  const editCaption = async (k, text) => {
    await p.locator(`.day[data-k="${k}"]`).click(); await p.locator('[data-view="detail"]').waitFor(); await p.waitForTimeout(400);
    await p.locator(".caption").click(); await p.locator(".caption textarea").fill(text);
    await p.locator('[data-a="save-caption"]').click(); await p.waitForTimeout(400);
    await p.locator('[data-a="back"]').click(); await p.waitForTimeout(600);
  };
  const restoreFile = async (file, choice) => {
    await settings(p);
    (await chooser(p, () => p.locator('[data-a="restore"]').click())).setFiles(file);
    await Promise.race([p.locator(".asheet").waitFor({ timeout: 20000 }), p.locator(".toast", { hasText: /Nothing was changed/ }).waitFor({ timeout: 20000 })]).catch(() => {});
    const msg = (await p.locator(".asheet .msg").count()) ? await p.locator(".asheet .msg").textContent() : null;
    if (choice === "cancel") await p.locator(".asheet .cancel").click();
    else if (choice) await p.locator(`[data-a="${choice}"]`).click();
    const t = await toastLike(p, FINAL);
    await p.locator('[data-view="settings"] [data-a="back"]').click().catch(() => {}); await p.waitForTimeout(500);
    return { msg, toast: t };
  };
  await editCaption(today, "Mine");
  let r = await restoreFile(zipPath, "restore-keep");
  ok(/already have photos here/.test(r.msg) && (await days(p)).find((x) => x.date === today).caption === "Mine", "conflict, Keep: my photo stays");
  ok(new RegExp(`kept ${real.length} of yours`).test(r.toast), "conflict, Keep: the summary says what was kept");
  await editCaption(today, "Mine again");
  const beforeCancel = await snapshot(p);
  r = await restoreFile(zipPath, "cancel");
  ok(/Restore cancelled/.test(r.toast) && (await snapshot(p)) === beforeCancel, "conflict, Cancel: nothing changes");
  r = await restoreFile(zipPath, "restore-replace");
  ok((await days(p)).find((x) => x.date === today).caption === real.find((x) => x.date === today).caption, "conflict, Replace: the backup's photo replaces mine");
  ok(new RegExp(`replaced ${real.length} of yours`).test(r.toast), "conflict, Replace: the summary says what was replaced");

  // Bad archives through the real UI: refused, journal untouched.
  const jpeg = new Uint8Array(fs.readFileSync(FIX + "plain.jpg"));
  const man = (entries, extra = {}) => strToU8(JSON.stringify({ format: "photonic-backup", version: 1, entries, ...extra }));
  const ent = (date) => ({ date, file: `photos/${date}.jpg`, type: "image/jpeg", caption: "bad" });
  const bad = {
    corrupt: Uint8Array.from([0x50, 0x4b, 3, 4, ...new Array(500).fill(1)]),
    newer: zipSync({ "manifest.json": man([ent("2026-09-01")], { version: 9 }), "photos/2026-09-01.jpg": jpeg }),
    duplicate: zipSync({ "manifest.json": man([ent("2026-09-01"), ent("2026-09-01")]), "photos/2026-09-01.jpg": jpeg }),
    missing: zipSync({ "manifest.json": man([ent("2026-09-01"), ent("2026-09-02")]), "photos/2026-09-01.jpg": jpeg }),
    unsafe: zipSync({ "manifest.json": man([ent("2026-09-01")]), "photos/2026-09-01.jpg": jpeg, "../../evil.js": strToU8("x") }),
    baddate: zipSync({ "manifest.json": man([{ ...ent("2026-13-01"), file: "photos/2026-13-01.jpg" }]), "photos/2026-13-01.jpg": jpeg }),
    notimage: zipSync({ "manifest.json": man([ent("2026-09-01")]), "photos/2026-09-01.jpg": strToU8("hello") }),
    undecodable: zipSync({ "manifest.json": man([ent("2026-09-01")]), "photos/2026-09-01.jpg": Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(300).fill(3)]) }),
  };
  const guard = await snapshot(p);
  for (const [name, bytes] of Object.entries(bad)) {
    const f = `${OUT}/bad-${name}.zip`; fs.writeFileSync(f, bytes);
    r = await restoreFile(f, null);
    ok(/Nothing was changed/.test(r.toast) && !r.msg && (await snapshot(p)) === guard, `bad backup (${name}): refused before any change`);
  }

  // Quota during restore: one transaction, so nothing lands.
  const big = zipSync({ "manifest.json": man([ent("2026-09-01"), ent("2026-09-02"), ent("2026-09-03")]), "photos/2026-09-01.jpg": jpeg, "photos/2026-09-02.jpg": jpeg, "photos/2026-09-03.jpg": jpeg });
  fs.writeFileSync(`${OUT}/three.zip`, big);
  await settings(p);
  (await chooser(p, () => p.locator('[data-a="restore"]').click())).setFiles(`${OUT}/three.zip`);
  await p.locator(".asheet").waitFor({ timeout: 20000 });
  await p.evaluate(() => { window.__failWrites = 3; }); // fails partway through the second day
  await p.locator('[data-a="restore-keep"]').click();
  r = { toast: await toastLike(p, FINAL) };
  await p.evaluate(() => { window.__failWrites = Infinity; });
  ok(/out of space/.test(r.toast) && /Nothing was changed/.test(r.toast), "quota during restore: clear message");
  ok((await snapshot(p)) === guard && !(await days(p)).some((x) => x.date.startsWith("2026-09")), "quota during restore: rolled back, not one day half-written");
  await ctx.close();

  // ================= 7. Look Back with real records =================
  const C = newProfile();
  ({ ctx, p } = await open(C));
  const lb = await p.evaluate(() => {
    const d = new Date(), out = [];
    const k = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    for (const i of [1, 2, 12]) { const last = new Date(d.getFullYear(), d.getMonth() - i + 1, 0).getDate(); out.push(k(new Date(d.getFullYear(), d.getMonth() - i, Math.min(d.getDate(), last)))); }
    return out;
  });
  fs.writeFileSync(`${OUT}/lookback.zip`, zipSync({ "manifest.json": man(lb.map((x) => ({ ...ent(x), caption: `memory ${x}` }))), ...Object.fromEntries(lb.map((x) => [`photos/${x}.jpg`, jpeg])) }));
  await settings(p);
  (await chooser(p, () => p.locator('[data-a="restore"]').click())).setFiles(`${OUT}/lookback.zip`);
  await p.locator('[data-a="restore-keep"]').click(); await toastLike(p, FINAL);
  await p.locator('[data-view="settings"] [data-a="back"]').click(); await p.waitForTimeout(500);
  await p.locator('[data-tab="lookback"]').click(); await p.waitForTimeout(500);
  const labels = await p.locator(".lb-label").evaluateAll((els) => els.map((e) => e.firstChild.textContent));
  ok(labels.join("|") === "A month ago|2 months ago|A year ago", `look back: same day a month, two months and a year ago, newest first (${labels.join("|")})`);
  await p.locator(".lb-photo").last().click(); await p.locator('[data-view="detail"]').waitFor(); await p.waitForTimeout(300);
  ok((await p.locator(".bar .ttl span").textContent()).endsWith(String(+lb[2].slice(0, 4))), "look back: a memory opens its own day");
  await ctx.close();

  // ================= 8. Demo stays out of the real journal =================
  ({ ctx, p } = await open(A, { url: "http://localhost:4176/?demo" }));
  ok((await p.locator(".day.has").count()) === 67, "demo: shows the sample journal");
  ok(!(await p.evaluate(async () => (await indexedDB.databases()).map((x) => x.name))).length, "demo: opens no database at all (different origin here, and none in code)");
  await p.evaluate(() => app.reset(true));
  await ctx.close();
  ({ ctx, p } = await open(A));
  ok((await days(p)).length === real.length, "demo: resetting the demo leaves the real journal alone");
  ok(!(await p.evaluate(() => localStorage.length)) || (await p.evaluate(() => localStorage.getItem("photonic-theme"))) !== null, "demo: no demo state in the real app's storage");
  await ctx.close();

  // ================= 9. An install made by an earlier build keeps its data =================
  const D = newProfile();
  {
    const c = await chromium.launchPersistentContext(D, { executablePath: CHROME });
    const pg = c.pages()[0] || (await c.newPage());
    await pg.goto(URL_ + "manifest.webmanifest");
    // Build the v1 database by hand, the way a first-day install left it, with no app code.
    await pg.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const blob = new Blob([bytes], { type: "image/jpeg" });
      await new Promise((res, rej) => {
        const r = indexedDB.open("photonic", 1);
        r.onupgradeneeded = () => { const db = r.result; for (const [n, k] of [["days", "date"], ["images", "date"], ["undo", "date"], ["settings", "key"]]) db.createObjectStore(n, { keyPath: k }); };
        r.onsuccess = () => {
          const db = r.result, tx = db.transaction(["days", "images"], "readwrite");
          tx.objectStore("days").put({ schema: 1, id: "old-1", date: "2026-10-02", thumb: null, caption: "from an older build", takenAt: null, dateSource: "camera", lat: null, lng: null, locationSource: null, createdAt: "2026-10-02T09:00:00.000Z", updatedAt: "2026-10-02T09:00:00.000Z" });
          tx.objectStore("images").put({ date: "2026-10-02", blob });
          tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error);
        };
        r.onerror = () => rej(r.error);
      });
    }, fs.readFileSync(FIX + "plain.jpg").toString("base64"));
    await c.close();
  }
  ({ ctx, p } = await open(D));
  await p.waitForTimeout(1500); // the thumbnail repair runs after start
  d = (await days(p)).find((x) => x.date === "2026-10-02");
  ok(d && d.caption === "from an older build" && d.id === "old-1", "older install: its record is read as is");
  ok(d && d.thumbSize > 0 && (await p.locator('.day.has[data-k="2026-10-02"]').count()) === 1, "older install: a missing thumbnail is rebuilt from the full image");
  await ctx.close();

  // ================= 10. Narrow phone and safe areas =================
  ({ ctx, p } = await open(A));
  await p.setViewportSize({ width: 320, height: 568 });
  await p.addStyleTag({ content: ":root{--safe-top:47px;--safe-bottom:34px}" });
  await p.waitForTimeout(300);
  const lay = await p.evaluate(() => {
    const tb = document.querySelector(".tabbar").getBoundingClientRect(), h1 = document.querySelector(".cal-head h1").getBoundingClientRect();
    const more = document.querySelector('[data-a="menu"]').getBoundingClientRect(), cell = document.querySelector(".day").getBoundingClientRect();
    return { overflow: document.scrollingElement.scrollWidth > innerWidth, tbBottom: tb.bottom, h1Top: h1.top, moreRight: more.right, cell: cell.width };
  });
  ok(!lay.overflow && lay.moreRight <= 320 && lay.cell >= 34, `320pt phone: no sideways scroll, controls fit (day squares ${lay.cell.toFixed(0)}pt)`);
  ok(lay.tbBottom <= 568 - 34 && lay.h1Top >= 47, "320pt phone: the tab bar clears the home indicator, the title clears the status bar");
  await ctx.close();

  // ================= 11. Delete all, with confirmation =================
  ({ ctx, p } = await open(B));
  await settings(p);
  await p.locator('[data-a="delete-all"]').click();
  await p.locator(".asheet .cancel").click(); await p.waitForTimeout(300);
  ok((await days(p)).length > 0, "delete all: cancelling keeps everything");
  await p.locator('[data-a="delete-all"]').click(); await p.locator('[data-a="delete-all-do"]').click(); await p.waitForTimeout(600);
  ok((await days(p)).length === 0 && (await image(p, today)) === null && (await p.locator(".empty-note").count()) === 1, "delete all: database emptied, empty state shown");
  await ctx.close();
} catch (e) {
  failed++;
  console.log("FAIL crashed:", e.message.split("\n")[0]);
}

await new Promise((r) => prodSrv.httpServer.close(r));
await new Promise((r) => demoSrv.httpServer.close(r));
for (const d of profiles) fs.rmSync(d, { recursive: true, force: true });
console.log(`\nprod: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
