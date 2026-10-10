# One-off: reminders, Settings structure, About links and the version in src/app.js (M6 release).
import io

P = "src/app.js"
s = io.open(P, encoding="utf-8", newline="").read()

def sub(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:90])
    s = s.replace(old, new)

def cut(start, end, new):
    global s
    a = s.index(start); a = s.rindex("\n", 0, a) + 1
    b = s.index(end, a); b = s.rindex("\n", 0, b) + 1
    s = s[:a] + new + s[b:]

sub('import { requestPersistence } from "./store.js";',
    'import { requestPersistence } from "./store.js";\nimport * as R from "./reminders.js";')
sub('const THEME_KEY = "photonic-theme";',
    '// eslint-disable-next-line no-undef\nconst VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev"; // from package.json, set at build\nconst THEME_KEY = "photonic-theme";')
sub("  info: `<svg", "  bell: `<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5l1.5-2Z\"/><path d=\"M10 20.5a2.2 2.2 0 0 0 4 0\"/></svg>`,\n  info: `<svg")
sub("""      theme: opts.theme || "system", // system | light | dark""",
    """      theme: opts.theme || "system", // system | light | dark
      remind: opts.reminder || null,  // { enabled, id, token, time, tz, aware, doneSent } (src/reminders.js)""")

# ---------- Settings ----------
cut("  settingsHTML() {", "  openSettings(scrollAbout) {", r'''  remindStatus() {
    const r = this.s.remind, sup = R.support();
    if (r?.enabled) return `On: one reminder a day at ${r.time}, ${r.tz.replace(/_/g, " ")} time. Delivery depends on your phone and browser.`
      + (r.aware ? " The reminder server is told only the date of your latest photo." : "");
    if (r?.lost) return "Your reminder stopped: this phone’s subscription expired or was removed. Turn reminders on again.";
    if (sup === "ios-install") return "On iPhone and iPad, reminders need iOS 16.4 or later and Photonic on your Home Screen: tap Share, then Add to Home Screen, and open Photonic from there.";
    if (sup === "unsupported") return "This browser can’t show reminders. Try Chrome on Android, or Photonic from the Home Screen on iPhone.";
    if (sup === "denied") return "Notifications are blocked for Photonic. Allow them in your phone or browser settings to use reminders.";
    return "One quiet notification a day, at the time you choose. Off until you turn it on.";
  }
  settingsHTML() {
    const n = this.count(), r = this.s.remind, on = !!r?.enabled;
    const chev = `<svg class="i" viewBox="0 0 24 24" style="stroke-width:2.2"><path d="m9 5 7 7-7 7"/></svg>`;
    const link = (href, label) => `<a class="row press" href="${href}">${label}<span class="v">${chev}</span></a>`;
    const sw = (a, label, checked, busy = false) => `<button class="row press" role="switch" aria-checked="${checked}" data-a="${a}"${busy ? " disabled" : ""}>${label}<span class="v"><span class="switch${checked ? " on" : ""}" aria-hidden="true"></span></span></button>`;
    return `<div class="scroll">
      <div class="bar"><button class="circ sm press" data-a="back" aria-label="Back">${I.back}</button><span></span><span></span></div>
      <div class="page-head"><h1>Settings</h1></div>
      <div class="group-label">Appearance</div>
      <div class="group">
        <div class="row seg-row"><div class="seg" role="radiogroup" aria-label="Appearance">${[["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) =>
          `<button role="radio" aria-checked="${this.s.theme === v}" data-a="theme" data-v="${v}">${l}</button>`).join("")}</div></div>
      </div>
      <div class="group-label">Reminders</div>
      <div class="group">
        ${sw("toggle-remind", "Daily reminder", on, this.remindBusy)}
        ${on ? `<label class="row">Time<span class="v"><input class="time-in" type="time" value="${r.time}" data-change="remind-time" aria-label="Reminder time"${this.remindBusy ? " disabled" : ""}></span></label>
        ${sw("toggle-aware", "Skip once today’s photo is in", !!r.aware, this.remindBusy)}` : ""}
      </div>
      <p class="group-foot" data-remind-status>${esc(this.remindStatus())}</p>
      <div class="group-label">Camera and location</div>
      <div class="group">
        ${sw("toggle-locate", "Location for new photos", this.s.locate)}
        <div class="row">Photo library<span class="v">Only what you pick</span></div>
      </div>
      <p class="group-foot">Photos are taken with your phone’s own camera. Photonic keeps the location a photo already has; with this on, new camera photos without one get your current location. Locations stay on this phone.</p>
      <div class="group-label">Your photos</div>
      <div class="group">
        <div class="row">On this phone<span class="v">${n} ${n === 1 ? "photo" : "photos"}</span></div>
        <button class="row press" data-a="export"${n ? "" : " disabled"}>Export all photos<span class="v">${chev}</span></button>
        <button class="row press" data-a="restore">Restore from backup<span class="v">${chev}</span></button>
      </div>
      <p class="group-foot">No account, and no server ever holds your photos: they live only in this app on this phone. Browser storage can be cleared, so export a backup now and then and keep it somewhere you trust. Where a backup goes is up to you.</p>
      <div class="group-label" id="about">About</div>
      <div class="group">
        ${link("/about/", "About Photonic")}
        ${link("/about/#privacy", "Privacy")}
        ${link("/about/#notices", "Open-source notices")}
        <div class="row">Version<span class="v">${VERSION} beta</span></div>
      </div>
      <div class="group" style="margin-top:26px;margin-bottom:60px"><button class="row red press" data-a="delete-all"${n ? "" : " disabled"}>Delete all photos</button></div>
    </div><div class="top-fade"></div>`;
  }
  refreshSettings() {
    const top = this.top();
    if (top?.dataset.view !== "settings") return;
    const y = top.querySelector(".scroll").scrollTop;
    top.innerHTML = this.settingsHTML();
    top.querySelector(".scroll").scrollTop = y;
  }
''')

# ---------- reminder actions ----------
sub("""      case "toggle-locate": {""", """      case "toggle-remind": {
        const r = s.remind;
        if (r?.enabled) {
          this.remindBusy = true; this.refreshSettings();
          return R.disable(r).then(({ serverOk }) => {
            s.remind = { enabled: false, time: r.time };
            this.saveRemind();
            this.toast(serverOk ? "Reminders off" : "Reminders off on this phone; the server forgets it on its next try");
          }).finally(() => { this.remindBusy = false; this.refreshSettings(); });
        }
        const sup = R.support();
        if (sup !== "ok") return this.toast(sup === "ios-install" ? "Add Photonic to your Home Screen first, then open it from there" : sup === "denied" ? "Notifications are blocked for Photonic in your settings" : "This browser can’t show reminders");
        return this.overlay(`<div class="sheet" role="dialog" aria-label="Daily reminder">
          <div class="glyph">${I.bell}</div>
          <h3>A daily reminder</h3>
          <p>One notification a day, at the time you choose. To deliver it, your browser gives the Photonic reminder server an anonymous address, with your reminder time and time zone. The server never receives your photos, captions or location.</p>
          <button class="btn primary wide press" data-a="remind-allow">Allow notifications</button>
          <button class="btn plain wide press" data-a="dismiss">Not now</button>
        </div>`);
      }
      case "remind-allow": {
        this.closeOverlay(true);
        const time = s.remind?.time || "20:00";
        const asking = R.enable({ time, aware: false }); // starts inside this tap, as the permission prompt requires
        this.remindBusy = true; this.refreshSettings();
        return asking.then((state) => {
          s.remind = state; this.saveRemind();
          this.toast(`Reminders on: every day at ${state.time}`);
          this.syncDone();
        }, (e) => this.toast(e.message || "Reminders couldn’t be turned on.")).finally(() => { this.remindBusy = false; this.refreshSettings(); });
      }
      case "toggle-aware": return this.changeRemind({ aware: !s.remind.aware });
      case "toggle-locate": {""")
sub("""      case "about": return this.openSettings(true);""", """      case "about": this.closeOverlay(true); location.href = "/about/"; return;""")
sub("""    // Past midnight with the app open: today moves on.""", """    // The reminder time is a native time picker; it reports on change.
    ph.addEventListener("change", (e) => {
      if (e.target.dataset.change !== "remind-time") return;
      const v = e.target.value;
      if (/^([01]\\d|2[0-3]):[0-5]\\d$/.test(v) && v !== this.s.remind?.time) this.changeRemind({ time: v });
    });
    // Past midnight with the app open: today moves on.""")

# ---------- keep the server's "done" date in step with today's photo ----------
sub("""  // ----- Backup (M5): made and read on the phone; nothing is uploaded -----""", """  // ----- Reminders (M6) -----
  saveRemind() { this.store.setSetting("reminder", this.s.remind).catch(() => {}); }
  async changeRemind(changes) {
    const r = this.s.remind;
    if (!r?.enabled || this.remindBusy) return;
    this.remindBusy = true; this.refreshSettings();
    try {
      this.s.remind = await R.update(r, changes);
      this.saveRemind();
      if (changes.time) this.toast(`Reminder moved to ${changes.time}`);
      if (changes.aware) await this.syncDone();
    } catch (e) {
      if (e.code === "expired") { this.s.remind = { ...r, enabled: false, lost: true }; this.saveRemind(); }
      this.toast(e.message);
    } finally { this.remindBusy = false; this.refreshSettings(); }
  }
  /* With "skip once today's photo is in" on, tell the server today's date when today has a
   * photo, and clear it if today's photo is removed. Only ever a date; never blocks saving. */
  async syncDone() {
    const r = this.s.remind;
    if (!r?.enabled || !r.aware) return;
    const date = this.s.photos[this.s.today] ? this.s.today : null;
    if (r.doneSent === date || (date === null && r.doneSent !== this.s.today)) return;
    try { this.s.remind = await R.reportDone(r, date); this.saveRemind(); }
    catch (e) { if (e.code === "expired") { this.s.remind = { ...r, enabled: false, lost: true }; this.saveRemind(); } }
  }
  /* On start: still subscribed? Same time zone? Then bring the done date up to date. */
  async initReminders() {
    if (!this.s.remind?.enabled) return;
    try {
      const next = await R.check(this.s.remind);
      if (next !== this.s.remind) { this.s.remind = next; this.saveRemind(); }
    } catch {}
    this.syncDone();
  }

  // ----- Backup (M5): made and read on the phone; nothing is uploaded -----""")
sub("""    if (before && before !== day) this.forget(before);
    this.pop("fade-out");""", """    if (before && before !== day) this.forget(before);
    this.pop("fade-out");
    if (d.k === this.s.today) this.syncDone();""")
sub("""          delete s.photos[k]; this.renderBase(); this.pop("fade-out"); this.forget(p);""",
    """          delete s.photos[k]; this.renderBase(); this.pop("fade-out"); this.forget(p);
          if (k === s.today) this.syncDone();""")
sub("""          s.photos = {}; this.popAll(); s.tab = "calendar"; this.renderBase(); this.toast("All photos deleted");""",
    """          s.photos = {}; this.popAll(); s.tab = "calendar"; this.renderBase(); this.toast("All photos deleted");
          this.syncDone();""")
sub("""        today: this.s.today,
        onProgress:""", """        today: this.s.today,
        app: `Photonic ${VERSION}`,
        onProgress:""")

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("ok")
