// Photonic test suite. Runs against the built apps:
//   dist-demo  (?demo, sample journal)  -> journey + visual comparison with shots/r5
//   dist       (production)             -> no demo data, offline launch, installability
// Usage: npm test   (builds both, then runs this)
import fs from "node:fs";
import { preview } from "vite";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "test-results";
fs.mkdirSync(OUT, { recursive: true });

let failed = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"} ${label}`); if (!cond) failed++; };

const demoSrv = await preview({ preview: { port: 4174, strictPort: true }, build: { outDir: "dist-demo" }, logLevel: "warn" });
const prodSrv = await preview({ preview: { port: 4173, strictPort: true }, build: { outDir: "dist" }, logLevel: "warn" });
const DEMO = "http://localhost:4174/?demo";
const PROD = "http://localhost:4173/";
const browser = await chromium.launch({ executablePath: CHROME });

// The mockups were rendered in an iPhone 17 Pro frame (safe areas 62/34) with Inter
// standing in for SF Pro on Windows. Reproduce those conditions for comparison.
const FRAME = `
  addEventListener("DOMContentLoaded", () => {
    const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=block";
    const s = document.createElement("style");
    s.textContent = ':root{--safe-top:62px;--safe-bottom:34px;--sf:"Inter",system-ui,sans-serif}';
    document.head.append(l, s);
  });`;

async function framedPage(url) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, serviceWorkers: "block" });
  await ctx.addInitScript(FRAME);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.goto(url, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  return { ctx, p, errors };
}

// ---------- 1. Visual comparison with the approved renders ----------
async function settle(p) {
  await p.waitForTimeout(700);
  await p.evaluate(() => Promise.all([...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight).map((i) => i.decode().catch(() => {}))));
}
function compare(actualBuf, refPath, name) {
  const a = PNG.sync.read(actualBuf), r = PNG.sync.read(fs.readFileSync(refPath));
  if (a.width !== r.width || a.height !== r.height) return ok(false, `${name}: size ${a.width}x${a.height} vs ${r.width}x${r.height}`);
  const W = a.width, H = a.height, k = W / 402;
  // Mask what only the mockup frame draws: status bar, home indicator, rounded corners.
  const R = 55 * k, top = 62 * k, bottom = H - 22 * k;
  const masked = (x, y) => {
    if (y < top || y > bottom) return true;
    const cx = x < R ? R : x > W - R ? W - R : x, cy = y < R ? R : y > H - R ? H - R : y;
    return (x - cx) ** 2 + (y - cy) ** 2 > R * R;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (masked(x, y)) {
    const i = (y * W + x) * 4; for (let c = 0; c < 4; c++) a.data[i + c] = r.data[i + c];
  }
  const diff = new PNG({ width: W, height: H });
  const n = pixelmatch(a.data, r.data, diff.data, W, H, { threshold: 0.1 });
  fs.writeFileSync(`${OUT}/${name}-diff.png`, PNG.sync.write(diff));
  fs.writeFileSync(`${OUT}/${name}.png`, PNG.sync.write(a));
  const pct = (100 * n) / (W * H);
  ok(pct < 0.5, `${name} matches shots/r5 (${pct.toFixed(3)}% of pixels differ, limit 0.5%)`);
}
{
  const { ctx, p } = await framedPage(DEMO);
  await settle(p); compare(await p.screenshot(), "shots/r5/01-calendar.png", "calendar");
  await p.locator('.day[data-k="2026-10-07"]').click(); await settle(p);
  compare(await p.screenshot(), "shots/r5/02-detail.png", "detail");
  await p.evaluate(() => app.reset(true)); await settle(p);
  compare(await p.screenshot(), "shots/r5/11-empty.png", "empty");
  await p.evaluate(() => { app.reset(false); toggleTheme(); }); await settle(p);
  compare(await p.screenshot(), "shots/r5/16-calendar-dark.png", "calendar-dark");
  await ctx.close();
}

// ---------- 2. The 16-step journey (from _work/journey.mjs) ----------
{
  const { ctx, p, errors } = await framedPage(DEMO);
  const ph = p.locator("#ph");
  const check = async (label, fn) => ok(await p.evaluate(fn), `journey: ${label}`);
  const title = () => document.querySelector(".bar .ttl span").textContent;
  await ph.locator('.day[data-k="2026-10-07"]').click();
  await check("detail shows 7 Oct", () => document.querySelector(".bar .ttl span").textContent === "7 October 2026");
  await ph.locator('[data-a="prev"]').click();
  await check("prev skips the missed 6 Oct to 5 Oct", () => document.querySelector(".bar .ttl span").textContent === "5 October 2026");
  await ph.locator('[data-a="next"]').click(); await ph.locator('[data-a="next"]').click();
  await check("next twice reaches 8 Oct", () => document.querySelector(".bar .ttl span").textContent === "8 October 2026");
  await check("next disabled on the last photo", () => document.querySelector('[data-a="next"]').disabled);
  const fr = await ph.locator(".photo-frame").boundingBox();
  await p.mouse.move(fr.x + 100, fr.y + 200); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(fr.x + 100 + i * 25, fr.y + 200); await p.waitForTimeout(8); }
  await p.mouse.up();
  await check("swipe right goes to 7 Oct", () => document.querySelector(".bar .ttl span").textContent === "7 October 2026");
  await ph.locator(".caption").click();
  await ph.locator(".caption textarea").fill("Nobody on the swing but the wind. Cold already.");
  await ph.locator('[data-a="save-caption"]').click();
  await check("caption saved", () => document.querySelector(".caption").textContent.includes("Cold already"));
  await ph.locator('[data-a="detail-actions"]').click(); await ph.locator('[data-a="remove-ask"]').click();
  await ph.locator(".asheet .cancel").click(); await p.waitForTimeout(300);
  await ph.locator('[data-a="back"]').click(); await p.waitForTimeout(600);
  await check("back to the calendar", () => !document.querySelector('[data-view="detail"]'));
  await ph.locator(".tab.cam").click(); await ph.locator('[data-a="primer-continue"]').click(); await ph.locator('[data-a="perm-allow"]').click();
  // The production app has no drawn status bar; the dark camera layer is what matters.
  await check("camera opens as a dark layer", () => !!document.querySelector('.layer.dark[data-view="camera"]'));
  await p.waitForTimeout(500);
  await ph.locator('[data-a="shutter"]').click(); await p.waitForTimeout(500);
  await ph.locator(".field textarea").fill("Lunch on the bench with Ama");
  await ph.locator('[data-a="save"]').click(); await p.waitForTimeout(900);
  await check("today now has a photo", () => !!document.querySelector(".day.today.has img"));
  await check("capture dot gone", () => !document.querySelector(".circ .dot"));
  await check("camera layer closed", () => !document.querySelector(".layer.dark"));
  await ph.locator('[data-a="capture"]').first().click(); await ph.locator('[data-a="library"]').click();
  await ph.locator('[data-a="pick"]').nth(1).click();
  await check("replace label shown", () => document.querySelector('[data-a="save"]').textContent === "Replace photo");
  await ph.locator('[data-a="save"]').click(); await p.waitForTimeout(900);
  await ph.locator('[data-a="undo"]').click(); await p.waitForTimeout(300);
  await check("undo restores the bench photo", () => document.querySelector(".day.today.has img").src.endsWith("p129.jpg"));
  await ph.locator('.day[data-k="2026-10-06"]').click(); await ph.locator('[data-a="pick"]').nth(2).click();
  await ph.locator('[data-a="save"]').click(); await p.waitForTimeout(900);
  await check("missed 6 Oct filled from the library", () => !!document.querySelector('.day[data-k="2026-10-06"] img'));
  await ph.locator('[data-a="menu"]').click(); await ph.locator('[data-a="settings"]').click(); await p.waitForTimeout(500);
  await check("settings shows camera Allowed", () => document.querySelector(".row .v").textContent.startsWith("Allowed"));
  await ph.locator('[data-a="delete-all"]').click(); await ph.locator('[data-a="delete-all-do"]').click(); await p.waitForTimeout(400);
  await check("delete all leads to the empty state", () => !!document.querySelector(".empty-note"));
  ok(errors.filter((e) => !/fonts\.g/.test(e)).length === 0, `journey: no console errors${errors.length ? " (" + errors.join("; ") + ")" : ""}`);
  await ctx.close();
}

// ---------- 3. Production build ----------
{
  // A real (non-incognito) profile: Chrome does not judge installability in incognito.
  const profile = fs.mkdtempSync(`${OUT}/profile-`);
  const ctx = await chromium.launchPersistentContext(profile, { executablePath: CHROME, viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
  const p = ctx.pages()[0] || (await ctx.newPage());
  await p.goto(PROD, { waitUntil: "networkidle" });
  ok(await p.evaluate(() => !!document.querySelector(".empty-note")), "production starts empty (no demo journal)");
  ok(await p.evaluate(() => { const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; return !!document.querySelector(`.day.today[data-k="${k}"]`); }), "today is the device's real date");
  const demoPhoto = await p.request.get(PROD + "demo/photos/p110.jpg");
  ok(!(demoPhoto.headers()["content-type"] || "").startsWith("image/"), "production build ships no demo photos");
  ok(await p.evaluate(() => !document.querySelector(".ac-status,.ac-island,.ac-home")), "no drawn phone frame in production");

  // Installability, as Chrome judges it.
  const cdp = await ctx.newCDPSession(p);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload({ waitUntil: "networkidle" });
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  ok(installabilityErrors.length === 0, `installable${installabilityErrors.length ? ": " + installabilityErrors.map((e) => e.errorId).join(", ") : ""}`);
  const man = await (await p.request.get(PROD + "manifest.webmanifest")).json();
  ok(man.display === "standalone" && man.icons.some((i) => i.purpose === "maskable"), "manifest: standalone, maskable icon");

  // Offline launch from the service worker cache.
  await ctx.setOffline(true);
  await p.reload({ waitUntil: "load" });
  ok(await p.evaluate(() => !!document.querySelector(".cal-head h1")?.textContent.includes("Photonic")), "opens offline after the first visit");
  await ctx.setOffline(false);

  // Small phone and wide screen still lay out.
  await p.setViewportSize({ width: 375, height: 667 });
  ok(await p.evaluate(() => document.querySelector(".grid").getBoundingClientRect().width <= 375 && document.scrollingElement.scrollWidth <= 375), "fits a 375pt phone, no sideways scroll");
  await p.setViewportSize({ width: 1280, height: 800 });
  ok(await p.evaluate(() => document.querySelector("#ph").getBoundingClientRect().width <= 520), "keeps a phone-width column on desktop");
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
}

await browser.close();
await new Promise((r) => demoSrv.httpServer.close(r));
await new Promise((r) => prodSrv.httpServer.close(r));
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
