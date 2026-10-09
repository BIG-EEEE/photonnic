# One-off: wire src/app.js to real storage (M2) and the phone's camera and picker (M3).
# Every replacement must match exactly once, so a drifted source fails loudly.
import io

P = "src/app.js"
s = io.open(P, encoding="utf-8", newline="").read()

def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

def cut(start, end, new):
    """Replace from the line containing `start` up to (not including) the line containing `end`."""
    global s
    a = s.index(start); a = s.rindex("\n", 0, a) + 1
    b = s.index(end, a); b = s.rindex("\n", 0, b) + 1
    s = s[:a] + new + s[b:]

# ---------- header, imports ----------
sub(""" *   mount(phEl, { photos, today, seed, base })
 */
""", """ *   mount(phEl, { store, days, today, seed, locate })
 *
 * Photos come from `store` (src/store.js): IndexedDB in the app, memory in ?demo.
 * Capture uses the phone's own camera and photo picker (file inputs); nothing is uploaded.
 */
import { key, todayKey, parseKey as parse, reliableKey } from "./dates.js";
import { processPhoto, readMeta, deviceLocation, thumbFrom, PhotoError } from "./image.js";
import { requestPersistence } from "./store.js";
""")
sub("""const pad = (n) => String(n).padStart(2, "0");
const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
""", "")
sub("""const todayKey = () => { const d = new Date(); return key(d.getFullYear(), d.getMonth(), d.getDate()); };

// Camera roll "recents" for the picker: today's shots first, then older ones.
const RECENTS = [129, 167, 177, 50, 71, 117, 83, 95, 11, 44, 90, 104, 155, 58, 140, 37, 38, 67];
const FEEDS = [129, 177];
""", """const byDate = (days) => Object.fromEntries(days.map((d) => [d.date, d]));
const OPEN_FAILED = "That photo couldn’t be opened. Try another one.";
""")

# ---------- constructor and image URLs ----------
sub("""    this.ph = ph;
    this.base = opts.base || "photos/";
    this.screen = ph.closest(".mini-screen, .screen");
    this.seedFn = opts.seed || (() => ({}));
    this.s = {
      today: opts.today || todayKey(),
      photos: opts.photos || {},
      perm: opts.perm || "unknown",
      tab: "calendar",
      feed: 0,
    };""", """    this.ph = ph;
    this.store = opts.store;
    this.screen = ph.closest(".mini-screen, .screen");
    this.seedFn = opts.seed || (() => []);
    this.fixedToday = !!opts.today;
    this.s = {
      today: opts.today || todayKey(),
      photos: byDate(opts.days || []),
      locate: !!opts.locate,
      tab: "calendar",
    };
    this.urls = new WeakMap();   // Blob -> object URL
    this.fullUrls = new Map();   // date -> { id, url } of the full image""")
sub("""  src(id) { return typeof id === "string" ? id : `${this.base}p${id}.jpg`; }
""", """  // Thumbnails and full images are Blobs (IndexedDB) or plain URLs (demo).
  url(x) {
    if (!x) return "";
    if (typeof x === "string") return x;
    let u = this.urls.get(x);
    if (!u) { u = URL.createObjectURL(x); this.urls.set(x, u); }
    return u;
  }
  thumb(p) { return this.url(p.thumb); }
  fullCached(k) { const c = this.fullUrls.get(k), p = this.s.photos[k]; return c && p && c.id === p.id ? c.url : ""; }
  async fullUrl(k) {
    const p = this.s.photos[k];
    if (!p) return "";
    const cached = this.fullCached(k);
    if (cached) return cached;
    const img = await this.store.getImage(k);
    if (!img || this.s.photos[k] !== p) return img ? "" : this.thumb(p);
    const url = this.url(img);
    this.fullUrls.set(k, { id: p.id, url });
    return url;
  }
  // Swap thumbnails for the full image once it is read from storage.
  hydrate(root) {
    for (const img of root.querySelectorAll("img[data-full]")) {
      this.fullUrl(img.dataset.full).then((u) => { if (u && img.isConnected && img.getAttribute("src") !== u) img.src = u; }, () => {});
    }
  }
  // Release a day's object URLs once nothing shows them any more.
  forget(p) {
    if (!p) return;
    const c = this.fullUrls.get(p.date);
    const urls = [c && c.id === p.id && c.url, p.thumb instanceof Blob && this.urls.get(p.thumb)].filter((u) => u && u.startsWith("blob:"));
    if (c && c.id === p.id) this.fullUrls.delete(p.date);
    if (p.thumb instanceof Blob) this.urls.delete(p.thumb);
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 1500);
  }
""")
sub("""    const nsc = this.baseLayer.querySelector(".scroll");
    if (nsc) nsc.scrollTop = y;
  }""", """    const nsc = this.baseLayer.querySelector(".scroll");
    if (nsc) nsc.scrollTop = y;
    this.hydrate(this.baseLayer);
  }""")

# ---------- thumbnails in calendar, look back, strip; full image in detail ----------
sub("""style="background-image:url('${this.src(p.id)}')"><img src="${this.src(p.id)}" alt=\"\"""",
    """style="background-image:url('${this.thumb(p)}')"><img src="${this.thumb(p)}" alt=\"\"""")
sub("""aria-label="Open ${dm(k)}"><img src="${this.src(p.id)}" alt=""></button>""",
    """aria-label="Open ${dm(k)}"><img src="${this.fullCached(k) || this.thumb(p)}" data-full="${k}" alt=""></button>""")
sub("""aria-label="${dm(d)}"><img src="${this.src(this.s.photos[d].id)}" alt="" loading="lazy"></button>""",
    """aria-label="${dm(d)}"><img src="${this.thumb(this.s.photos[d])}" alt="" loading="lazy"></button>""")
sub("""<div class="photo-frame" data-swipe><img src="${this.src(p.id)}" alt="Photo from ${dm(k)}"></div>""",
    """<div class="photo-frame" data-swipe><img src="${this.fullCached(k) || this.thumb(p)}" data-full="${k}" alt="Photo from ${dm(k)}"></div>""")
sub("""    const layer = this.push(this.detailHTML(k), { name: "detail", anim: fromEl ? "fade-in" : "enter-right" });
    this.centerStrip(layer, true);""", """    const layer = this.push(this.detailHTML(k), { name: "detail", anim: fromEl ? "fade-in" : "enter-right" });
    this.centerStrip(layer, true);
    this.hydrate(layer);""")
sub("""    layer.innerHTML = this.detailHTML(this.cur, editing);
    this.centerStrip(layer, dir === 0);""", """    layer.innerHTML = this.detailHTML(this.cur, editing);
    this.centerStrip(layer, dir === 0);
    this.hydrate(layer);""")

# ---------- capture: replace the simulated camera, permission screens and picker ----------
cut("  // ----- Capture -----", "  previewHTML() {", """  // ----- Capture: the phone's own camera and photo picker -----
  // Capture offers both. A missed day, or replacing a past day, goes straight to the
  // library: the day is already chosen.
  capture(k = this.s.today, fixed = false) {
    this.target = k;
    this.libSource = fixed ? "library" : "capture-library";
    if (k !== this.s.today) return this.pickFile("library");
    return this.actionSheet("", [["Take photo", "take-photo"], ["Choose from library", "choose-photo"]]);
  }
  // Must run inside the tap that asked for it, or the browser blocks the picker.
  pickFile(source) {
    this.closeOverlay(true);
    this.source = source; // camera | library (for this.target) | capture-library (date from the photo)
    (source === "camera" ? this.camInput : this.libInput).click();
  }
  async onFile(file) {
    if (!file) return; // picker cancelled: nothing to save
    const source = this.source, target = this.target;
    const inPreview = this.top()?.dataset.view === "preview";
    const caption = inPreview ? this.top().querySelector("textarea").value : "";
    const slow = setTimeout(() => this.toast("Opening photo…"), 300);
    let photo, meta;
    try {
      [meta, photo] = await Promise.all([readMeta(file), processPhoto(file)]);
    } catch (e) {
      clearTimeout(slow);
      return this.toast(e instanceof PhotoError ? e.message : OPEN_FAILED);
    }
    clearTimeout(slow);
    this.ph.querySelector(".toast")?.remove();
    const d = {
      k: target, from: source === "camera" ? "camera" : "library", photo, caption,
      taken: meta.taken, dateSource: "chosen",
      // The photo's own position wins; the device is asked only for a fresh camera shot.
      exifLoc: meta.lat != null ? { lat: meta.lat, lng: meta.lng, locationSource: "exif" } : null,
    };
    if (source === "camera") { d.k = this.s.today; d.dateSource = "camera"; }
    if (source === "capture-library") {
      const t = meta.taken && reliableKey(meta.taken.key, this.s.today) ? meta.taken.key : null;
      d.k = this.s.today; d.dateSource = t ? "exif" : "today";
      if (t && t !== this.s.today) { this.pending = d; return this.askDate(t); }
    }
    return this.showPreview(d);
  }
  askDate(k) {
    return this.actionSheet(`This photo is from ${dm(k)}.`, [[`Save to ${shortDate(k)}`, "date-photo"], ["Save to today", "date-today"]]);
  }
  showPreview(d) {
    d.url = URL.createObjectURL(d.photo.image);
    if (d.from === "camera" && this.s.locate && !d.exifLoc) d.locating = deviceLocation();
    const old = this.draft;
    this.draft = d;
    this.closeOverlay(true);
    const cur = this.top()?.dataset.view === "preview" ? this.top() : null;
    if (old?.url) setTimeout(() => URL.revokeObjectURL(old.url), 500);
    if (cur) { cur.innerHTML = this.previewHTML(); return cur; } // retake: same screen, new photo
    return this.push(this.previewHTML(), { name: "preview", anim: "enter-up" });
  }
  dropDraft() {
    if (this.draft?.url) URL.revokeObjectURL(this.draft.url);
    this.draft = null;
  }

""")
sub("""    const conflict = old ? `<div class="conflict"><img src="${this.src(old.id)}" alt="Current photo">""",
    """    const conflict = old ? `<div class="conflict"><img src="${this.thumb(old)}" alt="Current photo">""")
sub("""        <div class="photo-frame"><img src="${this.src(d.id)}" alt="New photo"></div>""",
    """        <div class="photo-frame"><img src="${d.url}" alt="New photo"></div>""")
cut("  openPreview(id, from) {", "  // ----- Menus and settings -----", """  async save() {
    const layer = this.top(), d = this.draft;
    if (this.saving || !d || layer?.dataset.view !== "preview") return;
    const btn = layer.querySelector('[data-a="save"]'), label = btn.textContent;
    d.caption = layer.querySelector("textarea").value.trim();
    this.saving = true; btn.disabled = true; btn.textContent = "Saving…";
    let loc = d.exifLoc;
    if (!loc && d.locating) {
      const p = await Promise.race([d.locating, new Promise((r) => setTimeout(() => r(null), 3000))]);
      if (p) loc = { ...p, locationSource: "device" };
    }
    const input = {
      date: d.k, image: d.photo.image, thumb: d.photo.thumb, width: d.photo.width, height: d.photo.height,
      caption: d.caption, takenAt: d.taken?.at || null, dateSource: d.dateSource, ...(loc || {}),
    };
    let day, prev = null;
    try {
      if (this.s.photos[d.k]) {
        try { ({ day, previous: prev } = await this.store.replace(input)); }
        catch (e) { if (e.code !== "missing") throw e; day = await this.store.add(input); }
      } else day = await this.store.add(input);
    } catch (e) {
      this.saving = false; btn.disabled = false; btn.textContent = label;
      if (e.code === "exists") {
        // Saved from another tab meanwhile: show this day's photo and ask again, never overwrite.
        const fresh = await this.store.get(d.k).catch(() => null);
        if (fresh) { this.s.photos[d.k] = fresh; this.renderBase(); layer.innerHTML = this.previewHTML(); layer.querySelector("textarea").value = d.caption; }
      }
      return this.toast(e.message || "Couldn’t save the photo. Try again.");
    }
    this.saving = false;
    if (!this.persistAsked) { this.persistAsked = true; requestPersistence(); }
    const before = this.s.photos[d.k];
    this.s.photos[d.k] = day;
    this.fullUrls.set(d.k, { id: day.id, url: d.url }); // the preview's URL now shows the saved photo
    this.draft = null;
    // Whatever sat underneath (a detail page) is now out of date: go home.
    this.layers.filter((l) => l !== layer).forEach((l) => l.remove());
    this.layers = [layer];
    this.s.tab = "calendar";
    this.renderBase();
    const cell = this.baseLayer.querySelector(`.day[data-k="${d.k}"]`);
    const sc = this.baseLayer.querySelector(".scroll");
    const pr = this.ph.getBoundingClientRect(), r = cell.getBoundingClientRect();
    if (r.top < pr.top + 120 || r.bottom > pr.bottom - 120) sc.scrollTop += r.top - pr.top - 260;
    this.fly(layer.querySelector(".photo-frame"), cell, 22, 12, () => {
      cell.classList.add("pop"); this.haptic(18);
      this.toast(prev ? `Replaced the photo for ${dm(d.k)}` : `Saved to ${dm(d.k)}`,
        prev ? () => this.undoReplace(d.k, day) : null);
    });
    if (before && before !== day) this.forget(before);
    this.pop("fade-out");
  }
  async undoReplace(k, replacement) {
    try {
      const back = await this.store.undo(k);
      this.forget(replacement);
      this.s.photos[k] = back;
      this.renderBase();
    } catch (e) { this.toast(e.message || "Couldn’t undo that."); }
  }

""")

# ---------- settings ----------
cut("  settingsHTML() {", "  openSettings(scrollAbout) {", """  settingsHTML() {
    const n = this.count();
    const chev = `<svg class="i" viewBox="0 0 24 24" style="stroke-width:2.2"><path d="m9 5 7 7-7 7"/></svg>`;
    return `<div class="scroll">
      <div class="bar"><button class="circ sm press" data-a="back" aria-label="Back">${I.back}</button><span></span><span></span></div>
      <div class="page-head"><h1>Settings</h1></div>
      <div class="group-label">Camera and location</div>
      <div class="group">
        <button class="row press" role="switch" aria-checked="${this.s.locate}" data-a="toggle-locate">Location for new photos<span class="v"><span class="switch${this.s.locate ? " on" : ""}" aria-hidden="true"></span></span></button>
        <div class="row">Photo library<span class="v">Only what you pick</span></div>
      </div>
      <p class="group-foot">Photos are taken with your phone’s own camera. Photonic keeps the location a photo already has; with this on, new camera photos without one get your current location. Locations stay on this phone.</p>
      <div class="group-label">Your photos</div>
      <div class="group">
        <div class="row">On this phone<span class="v">${n} ${n === 1 ? "photo" : "photos"}</span></div>
        <button class="row press" data-a="export"${n ? "" : " disabled"}>Export all photos<span class="v">${chev}</span></button>
      </div>
      <p class="group-foot">No account and no servers: your photos are kept only in this app on this phone. Export a backup before you change phones or clear your browser’s data.</p>
      <div class="group-label" id="about">About</div>
      <div class="group">
        <div class="row">Version<span class="v">1.0 (1)</span></div>
      </div>
      <div class="group" style="margin-top:26px;margin-bottom:60px"><button class="row red press" data-a="delete-all"${n ? "" : " disabled"}>Delete all photos</button></div>
    </div><div class="top-fade"></div>`;
  }
""")

# ---------- events ----------
sub("""    document.addEventListener("touchstart", () => {}, { passive: true }); // :active on iOS Safari
  }""", """    document.addEventListener("touchstart", () => {}, { passive: true }); // :active on iOS Safari
    // The phone's camera and photo picker. Hidden inputs, opened from a tap.
    const input = (camera) => {
      const i = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true });
      if (camera) i.setAttribute("capture", "environment");
      i.dataset.input = camera ? "camera" : "library";
      i.addEventListener("change", () => { const f = i.files && i.files[0]; i.value = ""; this.onFile(f); });
      document.body.append(i);
      return i;
    };
    this.camInput = input(true);
    this.libInput = input(false);
    // Past midnight with the app open: today moves on.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden || this.fixedToday) return;
      const t = todayKey();
      if (t !== this.s.today) { this.s.today = t; this.renderBase(); }
    });
  }""")

# ---------- actions ----------
sub("""      case "add-past": this.target = t.dataset.k; return this.picker();""",
    """      case "add-past": this.target = t.dataset.k; return this.pickFile("library");""")
sub("""      case "save-caption": s.photos[this.cur].caption = this.top().querySelector("textarea").value.trim(); return this.rerenderDetail(false);""",
    """      case "save-caption": {
        const k = this.cur, v = this.top().querySelector("textarea").value.trim();
        return this.store.setCaption(k, v).then((day) => { s.photos[k] = day; this.rerenderDetail(false); }, (e) => this.toast(e.message));
      }""")
sub("""      case "replace": this.closeOverlay(true); this.target = this.cur; return this.cur === s.today ? this.capture(this.cur) : this.picker();""",
    """      case "replace": this.closeOverlay(true); return this.capture(this.cur, true);""")
sub("""        const k = this.cur; delete s.photos[k]; this.closeOverlay(); this.renderBase(); this.pop("fade-out");
        return this.toast(`Removed the photo from ${dm(k)}`);""", """        const k = this.cur, p = s.photos[k];
        this.closeOverlay();
        return this.store.remove(k).then(() => {
          delete s.photos[k]; this.renderBase(); this.pop("fade-out"); this.forget(p);
          this.toast(`Removed the photo from ${dm(k)}`);
        }, (e) => this.toast(e.message));""")
cut('      case "primer-continue":', '      case "retake": {', """      case "take-photo": return this.pickFile("camera");
      case "choose-photo": return this.pickFile(this.libSource || "capture-library");
      case "date-photo": case "date-today": {
        const d = this.pending; this.pending = null;
        if (!d) return this.closeOverlay();
        if (a === "date-photo") { d.k = d.taken.key; d.dateSource = "exif"; } else { d.k = s.today; d.dateSource = "today"; }
        return this.showPreview(d);
      }
""")
sub("""      case "retake": {
        const from = this.draft.from; this.pop("fade-out");
        return from === "camera" ? this.openCamera() : this.picker();
      }""", """      case "retake": return this.pickFile(this.draft?.from === "camera" ? "camera" : this.source === "capture-library" ? "capture-library" : "library");""")
sub("""        return this.pop("exit-up");
      }
      case "discard": this.closeOverlay(true); return this.pop("exit-up");""", """        this.dropDraft();
        return this.pop("exit-up");
      }
      case "discard": this.closeOverlay(true); this.dropDraft(); return this.pop("exit-up");""")
sub("""      case "export": return this.actionSheet(`Export ${this.count()} photos with their dates and captions`, [["Save to Files as a .zip", "export-done"], ["Save to Photos", "export-done"]]);
      case "export-done": this.closeOverlay(); return this.toast(`Exported ${this.count()} photos`);
      case "open-settings-ios": return this.toast("Opens the iPhone Settings app");
      case "delete-all": return this.actionSheet(`Delete all ${this.count()} photos from Photonic? Photos in your iPhone library are not affected. This can’t be undone.`, [["Delete all photos", "delete-all-do", true]]);
      case "delete-all-do": s.photos = {}; this.closeOverlay(true); this.popAll(); s.tab = "calendar"; this.renderBase(); return this.toast("All photos deleted");""",
    """      // Backup and restore arrive in M5; until then say so rather than pretend.
      case "export": this.closeOverlay(true); return this.toast("Export arrives in the next update");
      case "toggle-locate": {
        s.locate = !s.locate;
        this.store.setSetting("locate", s.locate).catch(() => {});
        const sc = this.top().querySelector(".scroll"), y = sc.scrollTop;
        this.top().innerHTML = this.settingsHTML();
        this.top().querySelector(".scroll").scrollTop = y;
        return;
      }
      case "delete-all": return this.actionSheet(`Delete all ${this.count()} photos from Photonic? Photos in your phone’s own photo library are not affected. This can’t be undone.`, [["Delete all photos", "delete-all-do", true]]);
      case "delete-all-do": {
        this.closeOverlay(true);
        return this.store.clear().then(() => {
          Object.values(s.photos).forEach((p) => this.forget(p));
          s.photos = {}; this.popAll(); s.tab = "calendar"; this.renderBase(); this.toast("All photos deleted");
        }, (e) => this.toast(e.message));
      }""")
sub("""      case "dismiss": return this.closeOverlay();""", """      case "dismiss": this.pending = null; return this.closeOverlay();""")

# ---------- demo/test hooks, thumbnail repair ----------
cut("  // Prototype panel hooks (outside the phone)", "}\n\nfunction esc(s)", """  // A stored day whose thumbnail is missing gets a new one from its full image.
  async repairThumbs() {
    for (const p of Object.values(this.s.photos)) {
      if (p.thumb && (typeof p.thumb === "string" || p.thumb.size)) continue;
      try {
        const img = await this.store.getImage(p.date);
        if (!img) continue;
        const day = await this.store.setThumb(p.date, await thumbFrom(img));
        if (day) { this.s.photos[p.date] = day; this.renderBase(); }
      } catch {}
    }
  }

  // Demo and test hook: reload the memory store. Never touches the real database.
  async reset(empty) {
    if (!this.store.reset) throw new Error("reset is demo-only");
    this.closeOverlay(true); this.popAll(); this.dropDraft();
    this.store.reset(empty ? [] : this.seedFn());
    Object.assign(this.s, { photos: byDate(await this.store.list()), tab: "calendar" });
    this.renderBase();
  }
""")

io.open(P, "w", encoding="utf-8", newline="").write(s)
leftovers = [w for w in ["this.src(", "this.picker(", "openCamera", "primer", "perm", "RECENTS", "FEEDS", "systemAlert"] if w in s]
print("leftover references:", leftovers)
