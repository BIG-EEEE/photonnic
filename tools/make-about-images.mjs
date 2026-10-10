// Product shots for the public About page, taken from the real app (the demo build, which
// shows the sample journal only, never anyone's real photos). Also the 1200x630 social card.
// npm run build:demo && node tools/make-about-images.mjs  ->  public/about/*.jpg
import fs from "node:fs";
import { preview } from "vite";
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "public/about";
fs.mkdirSync(OUT, { recursive: true });
const srv = await preview({ preview: { port: 4191 }, build: { outDir: "dist-demo" }, logLevel: "error" });
const b = await chromium.launch({ executablePath: CHROME });
// An iPhone-sized frame: the app's own safe areas, rendered at 720 px wide.
const shot = async (name, setup, dark = false) => {
  const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 720 / 402, colorScheme: dark ? "dark" : "light", serviceWorkers: "block" });
  await ctx.addInitScript(`addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = ":root{--safe-top:54px;--safe-bottom:30px}"; document.head.append(s); });`);
  const p = await ctx.newPage();
  await p.goto("http://localhost:4191/?demo", { waitUntil: "networkidle" });
  await p.locator(".cal-head h1").waitFor();
  if (setup) await setup(p);
  await p.waitForTimeout(800);
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  fs.writeFileSync(`${OUT}/${name}.jpg`, await p.screenshot({ type: "jpeg", quality: 82 }));
  console.log(`${OUT}/${name}.jpg`, fs.statSync(`${OUT}/${name}.jpg`).size);
  await ctx.close();
};
await shot("calendar");
await shot("detail", async (p) => { await p.locator('.day[data-k="2026-10-07"]').click(); await p.locator('[data-view="detail"]').waitFor(); });
await shot("lookback", async (p) => { await p.locator('[data-tab="lookback"]').click(); });
await shot("dark", null, true);

// Social card: name, line, two phones.
const uri = (f) => "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64");
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700&display=block" rel="stylesheet"></head>
<body style="margin:0;width:1200px;height:630px;background:#F8F7F4;font-family:Inter,sans-serif;color:#1C1B19;position:relative;overflow:hidden">
  <div style="position:absolute;left:84px;top:180px;width:540px">
    <div style="display:flex;align-items:center;gap:18px"><img src="data:image/png;base64,${fs.readFileSync("public/icons/icon-192.png").toString("base64")}" style="width:72px;height:72px;border-radius:17px"><span style="font-size:44px;font-weight:700;letter-spacing:-1px">Photonnic</span></div>
    <div style="margin-top:34px;font-size:52px;line-height:60px;font-weight:700;letter-spacing:-1.6px">Your life, one photo at a time.</div>
    <div style="margin-top:22px;font-size:24px;color:#66645F">A private photo diary for every day.</div>
  </div>
  <img src="${uri(`${OUT}/calendar.jpg`)}" style="position:absolute;left:700px;top:60px;width:250px;border-radius:30px;box-shadow:0 20px 50px rgba(28,27,25,.18)">
  <img src="${uri(`${OUT}/dark.jpg`)}" style="position:absolute;left:910px;top:120px;width:250px;border-radius:30px;box-shadow:0 20px 50px rgba(28,27,25,.22)">
</body></html>`, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
fs.writeFileSync(`${OUT}/og.jpg`, await p.screenshot({ type: "jpeg", quality: 86 }));
console.log(`${OUT}/og.jpg`);
await b.close();
await new Promise((r) => srv.httpServer.close(r));
