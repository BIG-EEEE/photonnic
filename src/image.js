// Turns a photo the user picked into what Photonic stores, entirely on the device:
// a full image (longest side up to 2048 px) and a thumbnail (shortest side about 256 px),
// both JPEG at 0.85 with the orientation applied and every bit of metadata stripped.
import { exifDate } from "./dates.js";

export const MAX_BYTES = 50 * 1024 * 1024;
export const FULL_MAX = 2048;
export const THUMB_SHORT = 256;
export const QUALITY = 0.85;

export class PhotoError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const PHOTO_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i;
const isHeic = (f) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name || "");

export function checkFile(file) {
  if (!file) throw new PhotoError("none", "No photo was chosen.");
  if (!(file.type || "").startsWith("image/") && !PHOTO_EXT.test(file.name || "")) throw new PhotoError("type", "That file isn’t a photo.");
  if (file.size === 0) throw new PhotoError("decode", "That photo couldn’t be opened. Try another one.");
  if (file.size > MAX_BYTES) throw new PhotoError("size", "That photo is over 50 MB. Choose a smaller one.");
}

/* Scale (w, h) so the longest side is at most `max`. Never upscales. */
export function fitLong(w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}
/* Scale (w, h) so the shortest side is at most `min`. Never upscales. */
export function fitShort(w, h, min) {
  const s = Math.min(1, min / Math.min(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

// Decode with the EXIF orientation applied. createImageBitmap first; <img> as a fallback
// for browsers whose createImageBitmap rejects a format their <img> can show.
async function decode(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch {}
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    if (isHeic(file)) throw new PhotoError("format", "This browser can’t open HEIC photos. Try a JPEG or PNG.");
    throw new PhotoError("decode", "That photo couldn’t be opened. Try another one.");
  }
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

async function encode(src, w, h) {
  const off = typeof OffscreenCanvas !== "undefined";
  const canvas = off ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNGs get a white ground, not black
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  const blob = off
    ? await canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY })
    : await new Promise((r) => canvas.toBlob(r, "image/jpeg", QUALITY));
  canvas.width = canvas.height = 0; // let the browser free the pixels now
  if (!blob || !blob.size) throw new PhotoError("memory", "Your phone ran out of memory opening that photo. Try again.");
  return blob;
}

export async function processPhoto(file) {
  checkFile(file);
  const d = await decode(file);
  try {
    if (!d.w || !d.h) throw new PhotoError("decode", "That photo couldn’t be opened. Try another one.");
    const [fw, fh] = fitLong(d.w, d.h, FULL_MAX);
    const [tw, th] = fitShort(d.w, d.h, THUMB_SHORT);
    const image = await encode(d.src, fw, fh);
    const thumb = await encode(d.src, tw, th);
    return { image, thumb, width: fw, height: fh };
  } catch (e) {
    if (e instanceof PhotoError) throw e;
    throw new PhotoError("memory", "Your phone ran out of memory opening that photo. Try again.");
  } finally {
    d.done();
  }
}

/* A thumbnail from an already-stored full image (to repair a missing one). */
export async function thumbFrom(blob) {
  const d = await decode(blob);
  try { const [tw, th] = fitShort(d.w, d.h, THUMB_SHORT); return await encode(d.src, tw, th); }
  finally { d.done(); }
}

/* Capture date and GPS position from the original file, read before re-encoding
 * strips them. Missing or unreadable metadata is normal (pickers often strip it). */
export async function readMeta(file) {
  const out = { taken: null, lat: null, lng: null };
  try {
    const { default: exifr } = await import("exifr/dist/lite.esm.mjs");
    // One read of the header. (exifr's `pick` option throws in the lite build, so no pick.)
    // reviveValues: false keeps dates as their wall-clock text; GPS still comes back as decimals.
    const tags = await exifr.parse(file, { reviveValues: false, tiff: true, exif: true, gps: true, interop: false, ifd1: false });
    out.taken = exifDate(tags?.DateTimeOriginal) || exifDate(tags?.CreateDate);
    const ok = (v, lim) => Number.isFinite(v) && Math.abs(v) <= lim;
    if (tags && ok(tags.latitude, 90) && ok(tags.longitude, 180) && !(tags.latitude === 0 && tags.longitude === 0)) {
      out.lat = tags.latitude; out.lng = tags.longitude;
    }
  } catch {}
  return out;
}

/* The device's current position, only when the user turned location on and only for a
 * photo just taken with the camera. Resolves null on denial, timeout or no support. */
export function deviceLocation(timeout = 10000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 120000, timeout });
  });
}
