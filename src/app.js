/* Photonic app. Grew out of the approved prototype (prototype/app.js), which
 * stays untouched as the design reference.
 *
 *   mount(phEl, { store, days, today, seed, locate })
 *
 * Photos come from `store` (src/store.js): IndexedDB in the app, memory in ?demo.
 * Capture uses the phone's own camera and photo picker (file inputs); nothing is uploaded.
 */
import { key, todayKey, parseKey as parse, reliableKey } from "./dates.js";
import { processPhoto, readMeta, deviceLocation, thumbFrom, PhotoError } from "./image.js";
import { requestPersistence } from "./store.js";

// ---------- Icons (SF Symbols-style, one stroke weight) ----------
const I = {
  camera: `<svg class="i fill" viewBox="0 0 24 24"><path d="M9.2 4.2h5.6c.6 0 1.1.3 1.4.8l.9 1.5h2.4A2.5 2.5 0 0 1 22 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5V9a2.5 2.5 0 0 1 2.5-2.5h2.4l.9-1.5c.3-.5.8-.8 1.4-.8ZM12 9.2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 1.9a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Z" fill-rule="evenodd"/></svg>`,
  more: `<svg class="i fill" viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.5" cy="12" r="1.9"/></svg>`,
  house: `<svg class="i" viewBox="0 0 24 24"><path d="M4 10.2 12 4l8 6.2V19a1.5 1.5 0 0 1-1.5 1.5h-3.8v-5.2H9.3v5.2H5.5A1.5 1.5 0 0 1 4 19v-8.8Z"/></svg>`,
  houseFill: `<svg class="i fill" viewBox="0 0 24 24"><path d="M11.4 3.5a1 1 0 0 1 1.2 0l7.9 6.1c.3.2.5.6.5 1V19a2 2 0 0 1-2 2h-3.6a.6.6 0 0 1-.6-.6v-4.6a.6.6 0 0 0-.6-.6H9.8a.6.6 0 0 0-.6.6v4.6a.6.6 0 0 1-.6.6H5a2 2 0 0 1-2-2v-8.4c0-.4.2-.8.5-1l7.9-6.1Z"/></svg>`,
  sparkles: `<svg class="i" viewBox="0 0 24 24"><path d="M10 4.5c.5 3.7 1.8 5 5.5 5.5-3.7.5-5 1.8-5.5 5.5-.5-3.7-1.8-5-5.5-5.5 3.7-.5 5-1.8 5.5-5.5Z"/><path d="M17.5 13.5c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3Z"/><path d="M17 3.2c.2 1.2.6 1.6 1.8 1.8-1.2.2-1.6.6-1.8 1.8-.2-1.2-.6-1.6-1.8-1.8 1.2-.2 1.6-.6 1.8-1.8Z"/></svg>`,
  sparklesFill: `<svg class="i fill" viewBox="0 0 24 24"><path d="M10 3.8c.6 4 2 5.5 6.2 6.2-4.2.6-5.6 2-6.2 6.2-.6-4.2-2-5.6-6.2-6.2 4.2-.7 5.6-2.2 6.2-6.2Z"/><path d="M17.5 12.8c.3 2.3 1.1 3.1 3.4 3.4-2.3.4-3.1 1.1-3.4 3.4-.4-2.3-1.1-3-3.4-3.4 2.3-.3 3-1.1 3.4-3.4Z"/><path d="M17 2.6c.2 1.4.7 1.9 2.1 2.1-1.4.2-1.9.7-2.1 2.1-.2-1.4-.7-1.9-2.1-2.1 1.4-.2 1.9-.7 2.1-2.1Z"/></svg>`,
  back: `<svg class="i" viewBox="0 0 24 24" style="stroke-width:2.1"><path d="M15 5 8 12l7 7"/></svg>`,
  next: `<svg class="i" viewBox="0 0 24 24" style="stroke-width:2.1"><path d="m9 5 7 7-7 7"/></svg>`,
  close: `<svg class="i" viewBox="0 0 24 24" style="stroke-width:2.1"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  flip: `<svg class="i" viewBox="0 0 24 24"><path d="M4.5 9.5V8a2.5 2.5 0 0 1 2.5-2.5h1.4l.9-1.4c.3-.4.7-.6 1.2-.6h3c.5 0 .9.2 1.2.6l.9 1.4H17A2.5 2.5 0 0 1 19.5 8v8a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 16"/><path d="M8.2 10.5a4 4 0 0 1 7.1 0M15.8 13.5a4 4 0 0 1-7.1 0"/><path d="m15.6 8.6-.3 1.9-1.9-.3M8.4 15.4l.3-1.9 1.9.3"/></svg>`,
  pencil: `<svg class="i" viewBox="0 0 24 24"><path d="m15.5 5.5 3 3M5 16l10.6-10.6a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4Z"/></svg>`,
  gear: `<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/><circle cx="12" cy="12" r="6.6"/></svg>`,
  share: `<svg class="i" viewBox="0 0 24 24"><path d="M12 14.5V3.5M8 7.2l4-3.9 4 3.9"/><path d="M8.5 10H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1.5"/></svg>`,
  info: `<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/></svg>`,
  lock: `<svg class="i" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>`,
  cameraLine: `<svg class="i" viewBox="0 0 24 24"><path d="M9.2 4.5h5.6l1.5 2.2h3.2A2 2 0 0 1 21.5 8.7v9.3a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8.7a2 2 0 0 1 2-2h3.2l1.5-2.2Z"/><circle cx="12" cy="13" r="3.8"/></svg>`,
  cameraOff: `<svg class="i" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M9.2 4.5h5.6l1.5 2.2h3.2a2 2 0 0 1 2 2V17M18 20H4.5a2 2 0 0 1-2-2V8.7a2 2 0 0 1 2-2h2"/><path d="M9.6 10.5a3.8 3.8 0 0 0 5 5"/></svg>`,
};

// ---------- Dates ----------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const longDate = (k) => { const d = parse(k); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const dayName = (k) => DAYS[parse(k).getDay()];
const shortDate = (k) => { const d = parse(k); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
const dm = (k) => { const d = parse(k); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

const byDate = (days) => Object.fromEntries(days.map((d) => [d.date, d]));
const OPEN_FAILED = "That photo couldn’t be opened. Try another one.";

// ---------- App ----------
class App {
  constructor(ph, opts) {
    this.ph = ph;
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
    this.fullUrls = new Map();   // date -> { id, url } of the full image
    this.instant = !!opts.still;
    ph.innerHTML = "";
    this.layers = [];
    this.baseLayer = this.el(`<div class="layer"></div>`);
    ph.append(this.baseLayer);
    this.renderBase();
    if (!opts.still) this.wire();
  }

  // Thumbnails and full images are Blobs (IndexedDB) or plain URLs (demo).
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
  el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  days() { return Object.keys(this.s.photos).sort(); }
  count() { return this.days().length; }
  haptic(ms = 10) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }
  setChrome() {
    if (!this.screen || this.screen.dataset.chrome === "none") return;
    const top = this.layers[this.layers.length - 1];
    if (top && top.classList.contains("dark")) this.screen.dataset.chrome = "light";
    else delete this.screen.dataset.chrome;
  }

  // ----- Base: calendar or look back -----
  renderBase() {
    const sc = this.baseLayer.querySelector(".scroll");
    const y = sc ? sc.scrollTop : 0;
    this.baseLayer.innerHTML = (this.s.tab === "calendar" ? this.calendarHTML() : this.lookbackHTML()) + this.tabbarHTML();
    const nsc = this.baseLayer.querySelector(".scroll");
    if (nsc) nsc.scrollTop = y;
    this.hydrate(this.baseLayer);
  }

  headerHTML() {
    const pending = !this.s.photos[this.s.today];
    return `<header class="cal-head">
      <div><h1>Photonic</h1><p>Your life, one photo at a time.</p></div>
      <div class="head-actions">
        <div class="circ-wrap"><button class="circ press" data-a="capture" aria-label="Capture today's photo">${I.camera}${pending ? `<span class="dot" aria-label="Today's photo not taken yet"></span>` : ""}</button><span class="circ-label">Capture</span></div>
        <div class="circ-wrap"><button class="circ press" data-a="menu" aria-label="More">${I.more}</button><span class="circ-label">More</span></div>
      </div>
    </header>`;
  }

  monthsList() {
    const t = parse(this.s.today);
    const first = this.days()[0];
    const start = first ? parse(first) : t;
    const out = [];
    let y = t.getFullYear(), m = t.getMonth();
    while (y > start.getFullYear() || (y === start.getFullYear() && m >= start.getMonth())) {
      out.push([y, m]);
      if (--m < 0) { m = 11; y--; }
    }
    return out;
  }

  monthHTML(y, m) {
    const lead = new Date(y, m, 1).getDay(); // Sunday-first weeks, as in the reference
    const n = new Date(y, m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < lead; i++) cells += `<span aria-hidden="true"></span>`;
    for (let d = 1; d <= n; d++) {
      const k = key(y, m, d), p = this.s.photos[k];
      // Days before the first photo were never missed: show them like the future, inactive.
      const isToday = k === this.s.today, future = k > this.s.today || !this.first || k < this.first;
      const label = `${dayName(k)} ${dm(k)}`;
      if (p) cells += `<button data-hit-expanded class="day has press${isToday ? " today" : ""}" data-a="open" data-k="${k}" aria-label="${label}, photo" style="background-image:url('${this.thumb(p)}')"><img src="${this.thumb(p)}" alt="" loading="lazy" decoding="async"><span class="n">${d}</span></button>`;
      else if (isToday) cells += `<button data-hit-expanded class="day today press" data-a="capture" data-k="${k}" aria-label="Today, ${dm(k)}, no photo yet">${d}</button>`;
      else if (future) cells += `<span class="day future" aria-hidden="true">${d}</span>`;
      else cells += `<button data-hit-expanded class="day past press" data-a="add-past" data-k="${k}" aria-label="${label}, no photo">${d}</button>`;
    }
    return `<section class="month"><h2>${MONTHS[m]} ${y}</h2><div class="grid">${cells}</div></section>`;
  }

  calendarHTML() {
    const empty = this.count() === 0;
    this.first = this.days()[0];
    const months = this.monthsList().map(([y, m]) => this.monthHTML(y, m)).join("");
    const note = empty ? `<div class="empty-note">
        <h3>Start with today.</h3>
        <p>Take one photo a day. Each one fills its square here, and month by month the calendar turns into a record of your life.</p>
        <button class="btn primary wide press" data-a="capture">${I.camera}Take today's photo</button>
      </div>` : "";
    return `<div class="scroll" data-scrolls>${this.headerHTML()}<div class="months">${months}${note}</div></div>
      <div class="top-fade"></div><div class="bottom-fade"></div>`;
  }

  lookbackHTML() {
    const t = parse(this.s.today);
    const items = [];
    for (let i = 1; i <= 3 && items.length < 2; i++) {
      const d = new Date(t.getFullYear(), t.getMonth() - i, t.getDate());
      const k = key(d.getFullYear(), d.getMonth(), d.getDate());
      if (this.s.photos[k]) items.push([i === 1 ? "A month ago" : `${i} months ago`, k]);
    }
    const first = this.days()[0];
    if (first && !items.some(([, k]) => k === first)) items.push(["Your first photo", first]);
    const body = items.length ? items.map(([label, k]) => {
      const p = this.s.photos[k];
      return `<div class="lb-item"><div class="lb-label">${label}<span>${dayName(k).slice(0, 3)} ${dm(k)}</span></div>
        <button class="lb-photo press" data-a="open" data-k="${k}" aria-label="Open ${dm(k)}"><img src="${this.fullCached(k) || this.thumb(p)}" data-full="${k}" alt=""></button>
        ${p.caption ? `<p class="lb-cap">${esc(p.caption)}</p>` : ""}</div>`;
    }).join("") : `<div class="lb-item"><p class="lb-cap" style="color:var(--ink-3)">Photos from earlier months show up here once you have a few.</p></div>`;
    return `<div class="scroll" data-scrolls>
      <div class="page-head" style="padding-top:66px"><h1>Look back</h1><p>The same day in earlier months.</p></div>
      ${body}
      ${items.length ? `<div style="margin:22px var(--margin) 130px"><button class="btn secondary wide press" data-a="shuffle">Open a random day</button></div>` : ""}
    </div><div class="top-fade"></div><div class="bottom-fade"></div>`;
  }

  tabbarHTML() {
    const cal = this.s.tab === "calendar";
    return `<nav class="tabbar" data-float aria-label="Tabs">
      <button class="tab press${cal ? " on" : ""}" data-a="tab" data-tab="calendar" aria-label="Calendar"${cal ? ` aria-current="page"` : ""}>${cal ? I.houseFill : I.house}</button>
      <button class="tab cam press" data-a="capture" aria-label="Capture today's photo"><span class="knob">${I.camera}</span></button>
      <button class="tab press${cal ? "" : " on"}" data-a="tab" data-tab="lookback" aria-label="Look back"${cal ? "" : ` aria-current="page"`}>${cal ? I.sparkles : I.sparklesFill}</button>
    </nav>`;
  }

  // ----- Layer stack -----
  push(html, { cls = "", anim = "enter-right", name } = {}) {
    const layer = this.el(`<div class="layer ${cls}" data-view="${name || ""}">${html}</div>`);
    if (!this.instant && anim) layer.classList.add(anim);
    this.ph.append(layer);
    this.layers.push(layer);
    layer.addEventListener("animationend", () => layer.classList.remove(anim), { once: true });
    this.setChrome();
    return layer;
  }
  pop(anim = "exit-right") {
    const layer = this.layers.pop();
    if (!layer) return Promise.resolve();
    this.setChrome();
    if (this.instant || !anim) { layer.remove(); return Promise.resolve(); }
    return new Promise((r) => {
      layer.classList.add(anim);
      layer.addEventListener("animationend", () => { layer.remove(); r(); }, { once: true });
    });
  }
  top() { return this.layers[this.layers.length - 1]; }
  popAll() { while (this.layers.length) this.layers.pop().remove(); this.setChrome(); }

  overlay(html, { clear = false } = {}) {
    this.closeOverlay(true);
    const scrim = this.el(`<div class="scrim${clear ? " clear" : ""}" data-a="dismiss"></div>`);
    const box = this.el(html);
    if (!this.instant) { scrim.classList.add("fade-in"); box.classList.add(box.classList.contains("menu") ? "menu-in" : box.classList.contains("alert") ? "fade-in" : "enter-up"); }
    this.ph.append(scrim, box);
    this.ov = [scrim, box];
    return box;
  }
  closeOverlay(now) {
    if (!this.ov) return;
    const [scrim, box] = this.ov; this.ov = null;
    if (now || this.instant) { scrim.remove(); box.remove(); return; }
    scrim.classList.replace("fade-in", "fade-out") || scrim.classList.add("fade-out");
    box.className = box.className.replace(/\b(menu-in|enter-up|fade-in)\b/g, "");
    box.classList.add(box.classList.contains("menu") || box.classList.contains("alert") ? "fade-out" : "exit-up");
    setTimeout(() => { scrim.remove(); box.remove(); }, 260);
  }

  toast(text, undo) {
    this.ph.querySelector(".toast")?.remove();
    const t = this.el(`<div class="toast${undo ? "" : " solo"} fade-in" role="status">${esc(text)}${undo ? `<button data-a="undo">Undo</button>` : ""}</div>`);
    this.ph.append(t);
    this.undoFn = undo || null;
    clearTimeout(this.tt);
    this.tt = setTimeout(() => { t.classList.replace("fade-in", "fade-out"); setTimeout(() => t.remove(), 220); this.undoFn = null; }, undo ? 4200 : 2400);
  }

  // ----- Detail -----
  detailHTML(k, editing = false) {
    const p = this.s.photos[k];
    const all = this.days(), i = all.indexOf(k);
    const strip = all.map((d) => `<button class="press${d === k ? " on" : ""}" data-a="goto" data-k="${d}" aria-label="${dm(d)}"><img src="${this.thumb(this.s.photos[d])}" alt="" loading="lazy"></button>`).join("");
    const cap = editing
      ? `<div class="caption"><textarea rows="2" maxlength="120" placeholder="Add a caption" aria-label="Caption">${esc(p.caption)}</textarea></div><div class="caption-meta">Up to 120 characters</div>`
      : p.caption
        ? `<p class="caption" data-a="edit">${esc(p.caption)}</p>`
        : `<button class="caption empty" data-a="edit">${I.pencil}Add a caption</button>`;
    return `<div class="bar">
        <button class="circ sm press" data-a="back" aria-label="Back to calendar">${I.back}</button>
        <div class="ttl"><b>${dayName(k)}</b><span>${longDate(k)}</span></div>
        ${editing ? `<button class="txt-btn press" data-a="save-caption">Done</button>` : `<button class="circ sm press" data-a="detail-actions" aria-label="Photo options">${I.more}</button>`}
      </div>
      <div class="detail-body">
        <div class="photo-frame" data-swipe><img src="${this.fullCached(k) || this.thumb(p)}" data-full="${k}" alt="Photo from ${dm(k)}"></div>
        ${cap}
        <div class="strip-wrap">
          <button class="nav-btn press" data-a="prev" aria-label="Previous photo"${i <= 0 ? " disabled" : ""}>${I.back}</button>
          <div class="strip">${strip}</div>
          <button class="nav-btn press" data-a="next" aria-label="Next photo"${i >= all.length - 1 ? " disabled" : ""}>${I.next}</button>
        </div>
      </div>`;
  }
  openDetail(k, fromEl) {
    this.cur = k;
    const layer = this.push(this.detailHTML(k), { name: "detail", anim: fromEl ? "fade-in" : "enter-right" });
    this.centerStrip(layer, true);
    this.hydrate(layer);
    if (fromEl && !this.instant) this.fly(fromEl, layer.querySelector(".photo-frame"), 12, 22);
    return layer;
  }
  rerenderDetail(editing = false, dir = 0) {
    const layer = this.top();
    layer.innerHTML = this.detailHTML(this.cur, editing);
    this.centerStrip(layer, dir === 0);
    this.hydrate(layer);
    if (dir && !this.instant) layer.querySelector(".photo-frame img").animate(
      [{ transform: `translateX(${dir * 40}px)`, opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 320, easing: "cubic-bezier(.32,.72,0,1)" });
    if (editing) { const ta = layer.querySelector("textarea"); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
  centerStrip(layer, instant) {
    const strip = layer.querySelector(".strip"), on = strip && strip.querySelector(".on");
    if (!on) return;
    const go = () => { strip.style.scrollBehavior = instant ? "auto" : ""; strip.scrollLeft = on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2; };
    requestAnimationFrame(go); go();
  }
  step(d) {
    const all = this.days(), i = all.indexOf(this.cur) + d;
    if (i < 0 || i >= all.length) return;
    this.cur = all[i]; this.haptic(5);
    this.rerenderDetail(false, d);
  }
  closeDetail() {
    const layer = this.top(), k = this.cur;
    const cell = this.s.tab === "calendar" && this.baseLayer.querySelector(`.day[data-k="${k}"]`);
    if (cell && !this.instant) {
      const sc = this.baseLayer.querySelector(".scroll"), r = cell.getBoundingClientRect(), pr = this.ph.getBoundingClientRect();
      if (r.top < pr.top + 120 || r.bottom > pr.bottom - 120) sc.scrollTop += r.top - pr.top - pr.height / 2;
      this.fly(layer.querySelector(".photo-frame"), cell, 22, 12);
      return this.pop("fade-out");
    }
    return this.pop();
  }

  // Shared-element flight between a thumbnail and a large photo (FLIP).
  fly(fromEl, toEl, r0, r1, done) {
    const pr = this.ph.getBoundingClientRect(), sc = pr.width / this.ph.offsetWidth;
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    const img = (fromEl.querySelector("img") || toEl.querySelector("img")).src;
    const f = this.el(`<div class="flyer"><img src="${img}" alt=""></div>`);
    const box = (x) => ({ left: (x.left - pr.left) / sc + "px", top: (x.top - pr.top) / sc + "px", width: x.width / sc + "px", height: x.height / sc + "px" });
    Object.assign(f.style, box(a), { borderRadius: r0 + "px" });
    this.ph.append(f);
    const hide = [fromEl, toEl];
    hide.forEach((e) => (e.style.visibility = "hidden"));
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anim = f.animate([{ ...box(a), borderRadius: r0 + "px" }, { ...box(b), borderRadius: r1 + "px" }],
      { duration: reduce ? 1 : 460, easing: "cubic-bezier(.32,.72,0,1)", fill: "forwards" });
    anim.onfinish = () => { hide.forEach((e) => (e.style.visibility = "")); f.remove(); done && done(); };
  }

  // ----- Capture: the phone's own camera and photo picker -----
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

  previewHTML() {
    const d = this.draft, k = d.k, old = this.s.photos[k], isToday = k === this.s.today;
    const conflict = old ? `<div class="conflict"><img src="${this.thumb(old)}" alt="Current photo">
        <span>${isToday ? "Today" : dm(k)} already has a photo. Saving replaces it.</span></div>` : "";
    return `<div class="bar">
        <button class="circ sm press" data-a="cancel-preview" aria-label="Cancel">${I.close}</button>
        <div class="ttl"><b>${isToday ? "Today" : dayName(k)}</b><span>${longDate(k)}</span></div><span></span>
      </div>
      <div class="preview-body">
        <div class="photo-frame"><img src="${d.url}" alt="New photo"></div>
        <div class="field"><textarea maxlength="120" placeholder="Add a caption (optional)" aria-label="Caption">${esc(d.caption || "")}</textarea></div>
        ${conflict}
        <div class="actions">
          <button class="btn secondary press" data-a="retake">${d.from === "camera" ? "Retake" : "Choose another"}</button>
          <button class="btn primary press" data-a="save">${old ? "Replace photo" : `Save to ${shortDate(k)}`}</button>
        </div>
      </div>`;
  }
  async save() {
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

  // ----- Menus and settings -----
  menu() {
    return this.overlay(`<div class="menu" role="menu">
      <button role="menuitem" data-a="settings">Settings${I.gear}</button>
      <button role="menuitem" data-a="export">Export photos${I.share}</button>
      <button role="menuitem" data-a="about">About Photonic${I.info}</button></div>`, { clear: true });
  }
  actionSheet(msg, items) {
    return this.overlay(`<div class="asheet" role="dialog">
      <div class="grp">${msg ? `<div class="msg">${msg}</div>` : ""}${items.map(([label, a, red]) => `<button class="${red ? "red" : ""}" data-a="${a}">${label}</button>`).join("")}</div>
      <button class="cancel" data-a="dismiss">Cancel</button></div>`);
  }
  settingsHTML() {
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
  openSettings(scrollAbout) {
    this.closeOverlay(true);
    const layer = this.push(this.settingsHTML(), { name: "settings" });
    if (scrollAbout) { const sc = layer.querySelector(".scroll"); sc.scrollTop = sc.scrollHeight; }
    return layer;
  }

  // ----- Events -----
  wire() {
    const ph = this.ph;
    ph.addEventListener("pointerdown", (e) => { const b = e.target.closest(".press,.shutter"); if (b) { b.classList.add("is-down"); const up = () => { b.classList.remove("is-down"); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); }; addEventListener("pointerup", up); addEventListener("pointercancel", up); } });
    ph.addEventListener("click", (e) => {
      const t = e.target.closest("[data-a]");
      if (!t || t.disabled) return;
      if (this.swiped) { this.swiped = false; return; }
      this.act(t.dataset.a, t, e);
    });
    ph.addEventListener("keydown", (e) => {
      if (this.top()?.dataset.view === "detail" && !e.target.closest("textarea")) {
        if (e.key === "ArrowLeft") this.step(-1);
        if (e.key === "ArrowRight") this.step(1);
        if (e.key === "Escape") this.closeDetail();
      }
    });
    // Swipe between days on the photo: 1:1 tracking, velocity decides.
    ph.addEventListener("pointerdown", (e) => {
      const frame = e.target.closest("[data-swipe]");
      if (!frame) return;
      const img = frame.querySelector("img"), x0 = e.clientX, hist = [[x0, e.timeStamp]];
      let dx = 0, live = false;
      const move = (ev) => {
        dx = ev.clientX - x0; hist.push([ev.clientX, ev.timeStamp]); if (hist.length > 5) hist.shift();
        if (!live && Math.abs(dx) > 10) { live = true; frame.setPointerCapture(e.pointerId); }
        if (live) { const all = this.days(), i = all.indexOf(this.cur); const edge = (dx > 0 && i === 0) || (dx < 0 && i === all.length - 1); img.style.transform = `translateX(${edge ? dx * .3 : dx}px)`; }
      };
      const end = () => {
        frame.removeEventListener("pointermove", move); frame.removeEventListener("pointerup", end); frame.removeEventListener("pointercancel", end);
        if (!live) return;
        this.swiped = true; setTimeout(() => (this.swiped = false), 50);
        const [a, b] = [hist[0], hist[hist.length - 1]], v = (b[0] - a[0]) / Math.max(1, b[1] - a[1]) * 1000;
        const projected = dx + (v / 1000) * 0.99 / (1 - 0.99);
        img.style.transition = "transform .3s cubic-bezier(.32,.72,0,1)"; img.style.transform = "";
        if (projected < -90) this.step(1); else if (projected > 90) this.step(-1);
      };
      frame.addEventListener("pointermove", move); frame.addEventListener("pointerup", end); frame.addEventListener("pointercancel", end);
    });
    document.addEventListener("touchstart", () => {}, { passive: true }); // :active on iOS Safari
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
  }

  act(a, t) {
    const s = this.s;
    switch (a) {
      case "capture": return this.capture(t.dataset.k || s.today);
      case "add-past": this.target = t.dataset.k; return this.pickFile("library");
      case "open": return this.openDetail(t.dataset.k, t.matches(".day,.lb-photo") ? t : null);
      case "back": return this.top()?.dataset.view === "detail" ? this.closeDetail() : this.pop();
      case "tab": s.tab = t.dataset.tab; this.renderBase(); this.baseLayer.querySelector(".scroll").scrollTop = 0; return this.haptic(5);
      case "prev": return this.step(-1);
      case "next": return this.step(1);
      case "goto": { const all = this.days(); const d = Math.sign(all.indexOf(t.dataset.k) - all.indexOf(this.cur)); this.cur = t.dataset.k; return this.rerenderDetail(false, d); }
      case "edit": this.closeOverlay(true); return this.rerenderDetail(true);
      case "save-caption": {
        const k = this.cur, v = this.top().querySelector("textarea").value.trim();
        return this.store.setCaption(k, v).then((day) => { s.photos[k] = day; this.rerenderDetail(false); }, (e) => this.toast(e.message));
      }
      case "detail-actions": return this.actionSheet("", [["Edit caption", "edit"], ["Replace photo", "replace"], ["Remove photo", "remove-ask", true]]);
      case "replace": this.closeOverlay(true); return this.capture(this.cur, true);
      case "remove-ask": return this.actionSheet(`Remove the photo from ${dm(this.cur)}? This can’t be undone.`, [["Remove photo", "remove", true]]);
      case "remove": {
        const k = this.cur, p = s.photos[k];
        this.closeOverlay();
        return this.store.remove(k).then(() => {
          delete s.photos[k]; this.renderBase(); this.pop("fade-out"); this.forget(p);
          this.toast(`Removed the photo from ${dm(k)}`);
        }, (e) => this.toast(e.message));
      }
      case "take-photo": return this.pickFile("camera");
      case "choose-photo": return this.pickFile(this.libSource || "capture-library");
      case "date-photo": case "date-today": {
        const d = this.pending; this.pending = null;
        if (!d) return this.closeOverlay();
        if (a === "date-photo") { d.k = d.taken.key; d.dateSource = "exif"; } else { d.k = s.today; d.dateSource = "today"; }
        return this.showPreview(d);
      }
      case "retake": return this.pickFile(this.draft?.from === "camera" ? "camera" : this.source === "capture-library" ? "capture-library" : "library");
      case "cancel-preview": {
        const typed = this.top().querySelector("textarea").value.trim();
        if (typed) return this.actionSheet("Discard this photo and caption?", [["Discard", "discard", true]]);
        this.dropDraft();
        return this.pop("exit-up");
      }
      case "discard": this.closeOverlay(true); this.dropDraft(); return this.pop("exit-up");
      case "save": return this.save();
      case "menu": return this.menu();
      case "settings": return this.openSettings();
      case "about": return this.openSettings(true);
      // Backup and restore arrive in M5; until then say so rather than pretend.
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
      }
      case "shuffle": { const all = this.days(); return this.openDetail(all[Math.floor(Math.random() * all.length)]); }
      case "undo": { const f = this.undoFn; this.ph.querySelector(".toast")?.remove(); this.undoFn = null; return f && f(); }
      case "dismiss": this.pending = null; return this.closeOverlay();
    }
  }

  // A stored day whose thumbnail is missing gets a new one from its full image.
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
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

export function mount(ph, opts = {}) { return new App(ph, opts); }
