// Screenshot a page: node snap.mjs <file-or-url> <out.png> [width] [height] [fullPage 1|0]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire("C:/Users/USER/.claude/skills/app-designer/package.json");
const { chromium } = require("playwright-core");
const [, , src, out, w = "2080", h = "1000", full = "1"] = process.argv;
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
await p.goto(src.startsWith("http") ? src : pathToFileURL(src).href, { waitUntil: "networkidle" });
await p.waitForTimeout(500);
await p.screenshot({ path: out, fullPage: full === "1" });
await b.close();
