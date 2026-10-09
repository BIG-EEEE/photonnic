// Drives the prototype through the brief's 11-step journey and screenshots each step.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const require = createRequire("C:/Users/USER/.claude/skills/app-designer/package.json");
const { chromium } = require("playwright-core");
const OUT = "C:/Users/USER/photonic/_work/journey";
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await b.newPage({ viewport: { width: 520, height: 960 }, deviceScaleFactor: 1 });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await p.goto(pathToFileURL("C:/Users/USER/photonic/prototype/index.html").href, { waitUntil: "networkidle" });
const ph = p.locator("#ph");
let n = 0;
const shot = async (name) => { await p.waitForTimeout(650); await p.locator(".screen").screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png` }); };
const check = async (label, fn) => { const ok = await p.evaluate(fn); console.log((ok ? "PASS " : "FAIL ") + label); };

await shot("calendar");
await ph.locator('.day[data-k="2026-10-07"]').click();
await shot("detail");
await check("detail shows 7 Oct", () => document.querySelector(".bar .ttl span").textContent === "7 October 2026");
await ph.locator('[data-a="prev"]').click();
await check("prev goes to 5 Oct (6 Oct has no photo)", () => document.querySelector(".bar .ttl span").textContent === "5 October 2026");
await ph.locator('[data-a="next"]').click(); await ph.locator('[data-a="next"]').click();
await check("next twice reaches 8 Oct", () => document.querySelector(".bar .ttl span").textContent === "8 October 2026");
await check("next disabled on last photo", () => document.querySelector('[data-a="next"]').disabled);
// swipe right on the photo -> previous day
const fr = await ph.locator(".photo-frame").boundingBox();
await p.mouse.move(fr.x + 100, fr.y + 200); await p.mouse.down();
for (let i = 1; i <= 8; i++) { await p.mouse.move(fr.x + 100 + i * 25, fr.y + 200); await p.waitForTimeout(8); }
await p.mouse.up();
await check("swipe right goes to 7 Oct", () => document.querySelector(".bar .ttl span").textContent === "7 October 2026");
await shot("detail-swiped");
// caption edit
await ph.locator(".caption").click();
await ph.locator(".caption textarea").fill("Nobody on the swing but the wind. Cold already.");
await shot("detail-editing");
await ph.locator('[data-a="save-caption"]').click();
await check("caption saved", () => document.querySelector(".caption").textContent.includes("Cold already"));
// remove confirmation, then cancel
await ph.locator('[data-a="detail-actions"]').click();
await shot("detail-actions");
await ph.locator('[data-a="remove-ask"]').click();
await shot("remove-confirm");
await ph.locator(".asheet .cancel").click();
await p.waitForTimeout(300);
await ph.locator('[data-a="back"]').click();
await p.waitForTimeout(600);
await check("back to calendar", () => !document.querySelector('[data-view="detail"]'));
// capture
await ph.locator('.tab.cam').click();
await shot("primer");
await ph.locator('[data-a="primer-continue"]').click();
await shot("system-alert");
await ph.locator('[data-a="perm-allow"]').click();
await shot("camera");
await check("status bar turns light on camera", () => document.querySelector(".screen").dataset.chrome === "light");
await ph.locator('[data-a="shutter"]').click();
await shot("preview");
await ph.locator(".field textarea").fill("Lunch on the bench with Ama");
await ph.locator('[data-a="save"]').click();
await p.waitForTimeout(200);
await shot("saved");
await check("today now has a photo", () => !!document.querySelector('.day.today.has img'));
await check("capture dot gone", () => !document.querySelector(".circ .dot"));
await check("status bar back to dark", () => !document.querySelector(".screen").dataset.chrome);
// replace flow
await ph.locator('[data-a="capture"]').first().click();
await ph.locator('[data-a="library"]').click();
await shot("picker");
await ph.locator('[data-a="pick"]').nth(1).click();
await shot("preview-replace");
await check("replace label shown", () => document.querySelector('[data-a="save"]').textContent === "Replace photo");
await ph.locator('[data-a="save"]').click();
await shot("replaced-toast");
await ph.locator('[data-a="undo"]').click();
await p.waitForTimeout(300);
await check("undo restores bench photo", () => document.querySelector('.day.today.has img').src.endsWith("p129.jpg"));
// past empty day
await ph.locator('.day[data-k="2026-10-06"]').click();
await ph.locator('[data-a="pick"]').nth(2).click();
await ph.locator('[data-a="save"]').click();
await p.waitForTimeout(900);
await check("6 Oct filled", () => !!document.querySelector('.day[data-k="2026-10-06"] img'));
// menu + settings
await ph.locator('[data-a="menu"]').click();
await shot("menu");
await ph.locator('[data-a="settings"]').click();
await shot("settings");
await check("camera shows Allowed", () => document.querySelector(".row .v").textContent.startsWith("Allowed"));
await ph.locator('[data-a="back"]').click();
await p.waitForTimeout(500);
// look back
await ph.locator('[data-tab="lookback"]').click();
await shot("lookback");
await ph.locator('[data-tab="calendar"]').click();
// denied path
await p.evaluate(() => app.reset(false));
await ph.locator('.tab.cam').click(); await ph.locator('[data-a="primer-continue"]').click(); await ph.locator('[data-a="perm-deny"]').click();
await shot("camera-denied");
await ph.locator('[data-a="close-camera"]').click(); await p.waitForTimeout(500);
// delete all -> empty state
await ph.locator('[data-a="menu"]').click(); await ph.locator('[data-a="settings"]').click(); await p.waitForTimeout(500);
await ph.locator('[data-a="delete-all"]').click();
await ph.locator('[data-a="delete-all-do"]').click();
await shot("empty");
await check("empty state shown", () => !!document.querySelector(".empty-note"));
// dark
await p.evaluate(() => { app.reset(false); toggleTheme(); });
await shot("calendar-dark");
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
await b.close();
