// Builds the test photos in tests/fixtures: real JPEGs drawn in Chrome, with EXIF
// written by piexifjs where a test needs a capture date, GPS or an orientation.
// node tools/make-fixtures.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
const piexif = createRequire(import.meta.url)("piexifjs");

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "tests/fixtures";
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage();
// draw(w, h, kind) -> base64 JPEG (or PNG) of a recognisable picture
const draw = (w, h, kind, type = "image/jpeg") => p.evaluate(async ([w, h, kind, type]) => {
  const c = new OffscreenCanvas(w, h), x = c.getContext("2d");
  if (kind === "split") { x.fillStyle = "#e01010"; x.fillRect(0, 0, w / 2, h); x.fillStyle = "#1030e0"; x.fillRect(w / 2, 0, w / 2, h); }
  else {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#f2b46b"); g.addColorStop(1, "#3b2a4a");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#1c1b19"; x.fillRect(w * .1, h * .7, w * .8, h * .08); // a bench on a sunset
    x.fillStyle = "#fff"; x.font = `${Math.round(h / 8)}px sans-serif`; x.fillText(kind, w * .08, h * .2);
  }
  const blob = await c.convertToBlob({ type, quality: 0.92 });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ""; for (const v of buf) s += String.fromCharCode(v);
  return btoa(s);
}, [w, h, kind, type]);

const save = (name, b64) => { fs.writeFileSync(`${OUT}/${name}`, Buffer.from(b64, "base64")); console.log(`${OUT}/${name}`, fs.statSync(`${OUT}/${name}`).size); };
const withExif = (b64, ifds) => {
  const bin = Buffer.from(b64, "base64").toString("binary");
  const out = piexif.insert(piexif.dump({ "0th": {}, Exif: {}, GPS: {}, ...ifds }), bin);
  return Buffer.from(out, "binary").toString("base64");
};
const gps = (lat, lng) => ({
  [piexif.GPSIFD.GPSLatitudeRef]: lat >= 0 ? "N" : "S",
  [piexif.GPSIFD.GPSLatitude]: piexif.GPSHelper.degToDmsRational(Math.abs(lat)),
  [piexif.GPSIFD.GPSLongitudeRef]: lng >= 0 ? "E" : "W",
  [piexif.GPSIFD.GPSLongitude]: piexif.GPSHelper.degToDmsRational(Math.abs(lng)),
});

// No metadata: what a phone camera usually hands a web page.
save("plain.jpg", await draw(1200, 900, "plain"));
// Taken 3 Oct 2026, 18:20, in Osu, Accra.
save("dated-gps.jpg", withExif(await draw(800, 600, "3 Oct"), {
  Exif: { [piexif.ExifIFD.DateTimeOriginal]: "2026:10:03 18:20:00" }, GPS: gps(5.5560, -0.1820),
}));
// A clock-wrong camera: dated in the future, so not reliable.
save("future.jpg", withExif(await draw(800, 600, "future"), { Exif: { [piexif.ExifIFD.DateTimeOriginal]: "2031:01:01 10:00:00" } }));
// Stored landscape (left red, right blue) with Orientation 6: shown portrait, red on top.
save("rotated.jpg", withExif(await draw(400, 200, "split"), { "0th": { [piexif.ImageIFD.Orientation]: 6 } }));
// A 12 MP photo: must come out at 2048 px on the long side.
save("big.jpg", await draw(4000, 3000, "big"));
// Smaller than the target: must not be upscaled. PNG on purpose.
save("small.png", await draw(300, 200, "small", "image/png"));
// Not a picture at all, and a picture that cannot be decoded.
fs.writeFileSync(`${OUT}/notes.txt`, "not a photo\n");
fs.writeFileSync(`${OUT}/corrupt.jpg`, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 7)]));
console.log("fixtures done");
await b.close();
