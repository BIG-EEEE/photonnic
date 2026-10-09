// Renders the approved app icon (mockup.html, .app-icon) to every size the PWA needs.
// node tools/make-icons.mjs  ->  public/icons/*.png
import fs from "node:fs";
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const photo = "data:image/jpeg;base64," + fs.readFileSync("prototype/photos/p110.jpg").toString("base64");
const OUT = "public/icons";
fs.mkdirSync(OUT, { recursive: true });

// Geometry from the 344pt master: tile inset 58, radius 52, "9" 54pt bold, 24 from the tile bottom.
const html = (n) => `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700&display=block" rel="stylesheet">
<style>
  html,body{margin:0}
  .i{position:relative;width:${n}px;height:${n}px;background:#F8F7F4;overflow:hidden}
  .t{position:absolute;inset:${n * 58 / 344}px;border-radius:${n * 52 / 344}px;overflow:hidden;box-shadow:0 ${n * 6 / 344}px ${n * 18 / 344}px rgba(28,27,25,.18)}
  .t img{width:100%;height:100%;object-fit:cover;display:block}
  .t::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 50%,rgba(0,0,0,.45))}
  .t b{position:absolute;left:0;right:0;bottom:${n * 24 / 344}px;text-align:center;z-index:1;color:#fff;
    font:700 ${n * 54 / 344}px/1 "Inter",-apple-system,system-ui,sans-serif;letter-spacing:${-n / 344}px}
</style></head><body><div class="i"><div class="t"><img src="${photo}"><b>9</b></div></div></body></html>`;

const sizes = { "icon-512.png": 512, "icon-192.png": 192, "icon-maskable-512.png": 512, "apple-touch-icon.png": 180, "favicon-32.png": 32 };
const b = await chromium.launch({ executablePath: CHROME });
for (const [name, n] of Object.entries(sizes)) {
  // Render at 4x and let the browser downsample, so small sizes stay crisp.
  const p = await b.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
  await p.setContent(html(n), { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.locator(".i").screenshot({ path: `${OUT}/${name}` });
  await p.close();
  console.log(`${OUT}/${name}`);
}
await b.close();
