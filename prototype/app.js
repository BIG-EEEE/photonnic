/* Photonic prototype: one renderer for the interactive prototype and the
 * static mockup frames. No build step, no dependencies.
 *
 *   Photonic.mount(phEl, { base: "photos/" })            interactive
 *   Photonic.mount(phEl, { base, ...spec, still: true })  frozen state for a mockup
 */
(() => {
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
  const pad = (n) => String(n).padStart(2, "0");
  const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const parse = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const longDate = (k) => { const d = parse(k); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const dayName = (k) => DAYS[parse(k).getDay()];
  const shortDate = (k) => { const d = parse(k); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
  const dm = (k) => { const d = parse(k); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

  // ---------- Sample journal: 23 July to 8 October 2026, a few days missed ----------
  const TODAY = "2026-10-09";
  function seed() {
    const plan = [
      [2026, 6, [23, 24, 25, 26, 27, 28, 29, 30, 31], [108, 51, 16, 54, 49, 13, 124, 46, 74]],
      [2026, 7, [1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 28, 29, 30, 31],
        [110, 109, 112, 85, 33, 17, 93, 103, 106, 59, 27, 47, 77, 69, 57, 111, 84, 43, 122, 88, 134, 76, 142, 65]],
      [2026, 8, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 24, 25, 26, 27, 28, 29, 30],
        [116, 118, 94, 18, 70, 81, 10, 28, 15, 19, 29, 121, 79, 141, 136, 125, 128, 62, 66, 67, 38, 37, 58, 140, 155, 104, 90]],
      [2026, 9, [1, 2, 3, 4, 5, 7, 8], [44, 11, 95, 83, 117, 71, 50]],
    ];
    const captions = {
      "2026-07-23": "First morning. Everything smells of salt.",
      "2026-07-27": "Every wall on this island is white",
      "2026-07-29": "Paddled out before the wind came up",
      "2026-07-31": "Last day of the trip",
      "2026-08-05": "Harvest started on the farm road",
      "2026-08-11": "New shoes, first proper walk",
      "2026-08-20": "This car has been parked on our street all week",
      "2026-08-22": "Walked home over the bridge",
      "2026-09-06": "The tree tunnel near Gran's house",
      "2026-09-09": "Two hours uphill for this",
      "2026-09-26": "Lighthouse in the rain",
      "2026-10-01": "Fog didn't lift until noon",
      "2026-10-05": "Front row. Ears still ringing.",
      "2026-10-07": "Nobody on the swing but the wind",
    };
    const photos = {};
    for (const [y, m, days, ids] of plan) days.forEach((d, i) => {
      const k = key(y, m, d);
      photos[k] = { id: ids[i], caption: captions[k] || "" };
    });
    return photos;
  }
  // Camera roll "recents" for the picker: today's shots first, then older ones.
  const RECENTS = [129, 167, 177, 50, 71, 117, 83, 95, 11, 44, 90, 104, 155, 58, 140, 37, 38, 67];
  const FEEDS = [129, 177];

  // ---------- App ----------
  class App {
    constructor(ph, opts) {
      this.ph = ph;
      this.base = opts.base || "photos/";
      this.screen = ph.closest(".mini-screen, .screen");
      this.s = {
        today: TODAY,
        photos: opts.empty ? {} : seed(),
        perm: opts.perm || "unknown",
        tab: "calendar",
        feed: 0,
      };
      if (opts.todayPhoto) this.s.photos[TODAY] = { id: opts.todayPhoto, caption: opts.todayCaption || "" };
      this.instant = !!opts.still;
      ph.innerHTML = "";
      this.layers = [];
      this.baseLayer = this.el(`<div class="layer"></div>`);
      ph.append(this.baseLayer);
      this.renderBase();
      if (!opts.still) this.wire();
    }

    src(id) { return typeof id === "string" ? id : `${this.base}p${id}.jpg`; }
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
        if (p) cells += `<button data-hit-expanded class="day has press${isToday ? " today" : ""}" data-a="open" data-k="${k}" aria-label="${label}, photo" style="background-image:url('${this.src(p.id)}')"><img src="${this.src(p.id)}" alt="" loading="lazy" decoding="async"><span class="n">${d}</span></button>`;
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
          <button class="lb-photo press" data-a="open" data-k="${k}" aria-label="Open ${dm(k)}"><img src="${this.src(p.id)}" alt=""></button>
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
      const strip = all.map((d) => `<button class="press${d === k ? " on" : ""}" data-a="goto" data-k="${d}" aria-label="${dm(d)}"><img src="${this.src(this.s.photos[d].id)}" alt="" loading="lazy"></button>`).join("");
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
          <div class="photo-frame" data-swipe><img src="${this.src(p.id)}" alt="Photo from ${dm(k)}"></div>
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
      if (fromEl && !this.instant) this.fly(fromEl, layer.querySelector(".photo-frame"), 12, 22);
      return layer;
    }
    rerenderDetail(editing = false, dir = 0) {
      const layer = this.top();
      layer.innerHTML = this.detailHTML(this.cur, editing);
      this.centerStrip(layer, dir === 0);
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

    // ----- Capture -----
    capture(k = this.s.today) {
      this.target = k;
      if (this.s.perm === "unknown") return this.primer();
      this.openCamera();
    }
    primer() {
      return this.overlay(`<div class="sheet" role="dialog" aria-label="Camera access">
        <div class="glyph">${I.cameraLine}</div>
        <h3>Take today's photo</h3>
        <p>Photonic uses the camera only when you tap Capture. Your photos are saved on this iPhone and nowhere else.</p>
        <button class="btn primary wide press" data-a="primer-continue">Continue</button>
        <button class="btn plain wide press" data-a="library">Choose from library instead</button>
      </div>`);
    }
    systemAlert() {
      return this.overlay(`<div class="alert" data-system role="alertdialog">
        <div class="a-body"><h4>“Photonic” Would Like to Access the Camera</h4><p>So you can take one photo a day. Photos stay on this iPhone.</p></div>
        <div class="a-btns"><button data-a="perm-deny">Don’t Allow</button><button class="def" data-a="perm-allow">Allow</button></div>
      </div>`);
    }
    cameraHTML() {
      const k = this.target, isToday = k === this.s.today;
      const top = `<div class="cam-top"><button class="circ-dark press" data-a="close-camera" aria-label="Close camera">${I.close}</button>
          <span class="chip">${isToday ? "Today" : dayName(k).slice(0, 3)}, ${dm(k)}</span><span style="width:44px"></span></div>`;
      if (this.s.perm === "denied") return `${top}<div class="denied">${I.cameraOff}
          <h3>Camera access is off</h3>
          <p>Turn it on in Settings to take photos here, or pick one from your library.</p>
          <button class="btn light press" data-a="open-settings-ios">Open Settings</button>
          <button class="btn ghost press" data-a="library">Choose from library</button></div>`;
      return `${top}
        <div class="cam-view"><img src="${this.src(FEEDS[this.s.feed])}" alt="Camera viewfinder"></div>
        <div class="cam-bottom">
          <button class="lib-thumb press" data-a="library" aria-label="Choose from library"><img src="${this.src(RECENTS[1])}" alt=""></button>
          <button class="shutter" data-a="shutter" aria-label="Take photo"></button>
          <button class="circ-dark press" data-a="flip" aria-label="Switch camera" style="justify-self:end">${I.flip}</button>
        </div><div class="flash"></div>`;
    }
    openCamera() {
      this.closeOverlay();
      return this.push(this.cameraHTML(), { cls: "dark", name: "camera", anim: "enter-up" });
    }
    picker() {
      const grid = RECENTS.map((id) => `<button class="press" data-a="pick" data-id="${id}" aria-label="Photo"><img src="${this.src(id)}" alt="" loading="lazy"></button>`).join("");
      return this.overlay(`<div class="picker" data-system role="dialog" aria-label="Photos">
        <div class="p-head"><button data-a="dismiss">Cancel</button><b>Photos</b><span></span></div>
        <div class="p-sub">Choose a photo for ${dm(this.target)}</div>
        <div class="p-grid">${grid}</div></div>`);
    }

    previewHTML() {
      const d = this.draft, k = d.k, old = this.s.photos[k], isToday = k === this.s.today;
      const conflict = old ? `<div class="conflict"><img src="${this.src(old.id)}" alt="Current photo">
          <span>${isToday ? "Today" : dm(k)} already has a photo. Saving replaces it.</span></div>` : "";
      return `<div class="bar">
          <button class="circ sm press" data-a="cancel-preview" aria-label="Cancel">${I.close}</button>
          <div class="ttl"><b>${isToday ? "Today" : dayName(k)}</b><span>${longDate(k)}</span></div><span></span>
        </div>
        <div class="preview-body">
          <div class="photo-frame"><img src="${this.src(d.id)}" alt="New photo"></div>
          <div class="field"><textarea maxlength="120" placeholder="Add a caption (optional)" aria-label="Caption">${esc(d.caption || "")}</textarea></div>
          ${conflict}
          <div class="actions">
            <button class="btn secondary press" data-a="retake">${d.from === "camera" ? "Retake" : "Choose another"}</button>
            <button class="btn primary press" data-a="save">${old ? "Replace photo" : `Save to ${shortDate(k)}`}</button>
          </div>
        </div>`;
    }
    openPreview(id, from) {
      this.closeOverlay(true);
      this.draft = { k: this.target, id, from, caption: "" };
      const cam = this.top() && this.top().dataset.view === "camera";
      const layer = this.push(this.previewHTML(), { name: "preview", anim: cam ? "fade-in" : "enter-up" });
      if (cam && !this.instant) setTimeout(() => { const c = this.layers.find((l) => l.dataset.view === "camera"); if (c) { c.remove(); this.layers.splice(this.layers.indexOf(c), 1); } }, 260);
      else if (cam) { const c = this.layers.find((l) => l.dataset.view === "camera"); c.remove(); this.layers.splice(this.layers.indexOf(c), 1); }
      return layer;
    }
    save() {
      const layer = this.top(), d = this.draft;
      d.caption = layer.querySelector("textarea").value.trim();
      const prev = this.s.photos[d.k];
      this.s.photos[d.k] = { id: d.id, caption: d.caption };
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
          prev ? () => { this.s.photos[d.k] = prev; this.renderBase(); } : null);
      });
      this.pop("fade-out");
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
      const cam = { granted: "Allowed", denied: "Off", unknown: "Not asked yet" }[this.s.perm];
      const n = this.count();
      const chev = `<svg class="i" viewBox="0 0 24 24" style="stroke-width:2.2"><path d="m9 5 7 7-7 7"/></svg>`;
      return `<div class="scroll">
        <div class="bar"><button class="circ sm press" data-a="back" aria-label="Back">${I.back}</button><span></span><span></span></div>
        <div class="page-head"><h1>Settings</h1></div>
        <div class="group-label">Access</div>
        <div class="group">
          <button class="row press" data-a="open-settings-ios">Camera<span class="v">${cam}${chev}</span></button>
          <button class="row press" data-a="open-settings-ios">Photo library<span class="v">Only what you pick${chev}</span></button>
        </div>
        <p class="group-foot">Change access in the iPhone Settings app. Photonic never reads your library on its own.</p>
        <div class="group-label">Your photos</div>
        <div class="group">
          <div class="row">On this iPhone<span class="v">${n} ${n === 1 ? "photo" : "photos"}</span></div>
          <button class="row press" data-a="export"${n ? "" : " disabled"}>Export all photos<span class="v">${chev}</span></button>
        </div>
        <p class="group-foot">No account and no servers. Photos are included in your iCloud Backup when it is on.</p>
        <div class="group-label" id="about">About</div>
        <div class="group">
          <div class="row">Version<span class="v">1.0 (1)</span></div>
          <button class="row press" data-a="open-settings-ios">Privacy policy<span class="v">${chev}</span></button>
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
    }

    act(a, t) {
      const s = this.s;
      switch (a) {
        case "capture": return this.capture(t.dataset.k || s.today);
        case "add-past": this.target = t.dataset.k; return this.picker();
        case "open": return this.openDetail(t.dataset.k, t.matches(".day,.lb-photo") ? t : null);
        case "back": return this.top()?.dataset.view === "detail" ? this.closeDetail() : this.pop();
        case "tab": s.tab = t.dataset.tab; this.renderBase(); this.baseLayer.querySelector(".scroll").scrollTop = 0; return this.haptic(5);
        case "prev": return this.step(-1);
        case "next": return this.step(1);
        case "goto": { const all = this.days(); const d = Math.sign(all.indexOf(t.dataset.k) - all.indexOf(this.cur)); this.cur = t.dataset.k; return this.rerenderDetail(false, d); }
        case "edit": this.closeOverlay(true); return this.rerenderDetail(true);
        case "save-caption": s.photos[this.cur].caption = this.top().querySelector("textarea").value.trim(); return this.rerenderDetail(false);
        case "detail-actions": return this.actionSheet("", [["Edit caption", "edit"], ["Replace photo", "replace"], ["Remove photo", "remove-ask", true]]);
        case "replace": this.closeOverlay(true); this.target = this.cur; return this.cur === s.today ? this.capture(this.cur) : this.picker();
        case "remove-ask": return this.actionSheet(`Remove the photo from ${dm(this.cur)}? This can’t be undone.`, [["Remove photo", "remove", true]]);
        case "remove": {
          const k = this.cur; delete s.photos[k]; this.closeOverlay(); this.renderBase(); this.pop("fade-out");
          return this.toast(`Removed the photo from ${dm(k)}`);
        }
        case "primer-continue": return this.systemAlert();
        case "perm-allow": s.perm = "granted"; this.closeOverlay(true); return this.openCamera();
        case "perm-deny": s.perm = "denied"; this.closeOverlay(true); return this.openCamera();
        case "close-camera": return this.pop("exit-up");
        case "flip": s.feed = 1 - s.feed; this.top().querySelector(".cam-view img").src = this.src(FEEDS[s.feed]); return;
        case "shutter": {
          this.haptic(12);
          const f = this.top().querySelector(".flash");
          f.animate([{ opacity: .9 }, { opacity: 0 }], { duration: 260, easing: "ease-out" });
          return setTimeout(() => this.openPreview(FEEDS[s.feed], "camera"), 160);
        }
        case "library": this.closeOverlay(true); return this.picker();
        case "pick": return this.openPreview(t.dataset.id.match(/^\d+$/) ? +t.dataset.id : t.dataset.id, "library");
        case "retake": {
          const from = this.draft.from; this.pop("fade-out");
          return from === "camera" ? this.openCamera() : this.picker();
        }
        case "cancel-preview": {
          const typed = this.top().querySelector("textarea").value.trim();
          if (typed) return this.actionSheet("Discard this photo and caption?", [["Discard", "discard", true]]);
          return this.pop("exit-up");
        }
        case "discard": this.closeOverlay(true); return this.pop("exit-up");
        case "save": return this.save();
        case "menu": return this.menu();
        case "settings": return this.openSettings();
        case "about": return this.openSettings(true);
        case "export": return this.actionSheet(`Export ${this.count()} photos with their dates and captions`, [["Save to Files as a .zip", "export-done"], ["Save to Photos", "export-done"]]);
        case "export-done": this.closeOverlay(); return this.toast(`Exported ${this.count()} photos`);
        case "open-settings-ios": return this.toast("Opens the iPhone Settings app");
        case "delete-all": return this.actionSheet(`Delete all ${this.count()} photos from Photonic? Photos in your iPhone library are not affected. This can’t be undone.`, [["Delete all photos", "delete-all-do", true]]);
        case "delete-all-do": s.photos = {}; this.closeOverlay(true); this.popAll(); s.tab = "calendar"; this.renderBase(); return this.toast("All photos deleted");
        case "shuffle": { const all = this.days(); return this.openDetail(all[Math.floor(Math.random() * all.length)]); }
        case "undo": { const f = this.undoFn; this.ph.querySelector(".toast")?.remove(); this.undoFn = null; return f && f(); }
        case "dismiss": return this.closeOverlay();
      }
    }

    // Prototype panel hooks (outside the phone)
    reset(empty) { this.closeOverlay(true); this.popAll(); Object.assign(this.s, { photos: empty ? {} : seed(), perm: "unknown", tab: "calendar", feed: 0 }); this.renderBase(); }
    addDevicePhoto(url) {
      this.target = this.target && this.top()?.dataset.view !== "detail" ? this.target : this.s.today;
      this.openPreview(url, "library");
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // Build a frozen state for a mockup frame.
  function still(ph, spec) {
    const app = new App(ph, { ...spec, still: true });
    if (spec.tab) { app.s.tab = spec.tab; app.renderBase(); }
    if (spec.scroll) app.baseLayer.querySelector(".scroll").scrollTop = spec.scroll;
    const k = spec.date || TODAY;
    if (spec.view === "detail") { app.openDetail(k); if (spec.editing) app.rerenderDetail(true); }
    if (spec.view === "settings") app.openSettings();
    if (spec.view === "camera") { app.target = k; app.openCamera(); }
    if (spec.view === "preview") { app.target = k; app.openPreview(spec.photo || 129, spec.from || "camera"); if (spec.caption) app.top().querySelector("textarea").value = spec.caption; }
    if (spec.overlay === "menu") app.menu();
    if (spec.overlay === "primer") app.primer();
    if (spec.overlay === "alert") app.systemAlert();
    if (spec.overlay === "picker") { app.target = k; app.picker(); }
    if (spec.overlay === "remove") { app.cur = k; app.act("remove-ask"); }
    if (spec.overlay === "detail-actions") app.act("detail-actions");
    // Everything under the top layer (or under an open overlay) is covered on purpose.
    const covered = [app.baseLayer, ...app.layers];
    if (!app.ov) covered.pop();
    covered.forEach((l) => l.setAttribute("data-behind", ""));
    return app;
  }

  window.Photonic = {
    mount: (ph, opts = {}) => (opts.still ? still(ph, opts) : new App(ph, opts)),
    TODAY,
  };
})();
