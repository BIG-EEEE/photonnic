# One-off: port prototype/app.js and app.css into src/ for the production build.
# Run from the project root. Kept for the record of what changed from the approved prototype.
import io, re, shutil

shutil.copy("prototype/app.js", "src/app.js")
shutil.copy("prototype/app.css", "src/app.css")

def rw(p, pairs):
    s = io.open(p, encoding="utf-8", newline="").read()
    for a, b in pairs:
        assert a in s, (p, a[:70])
        s = s.replace(a, b)
    io.open(p, "w", encoding="utf-8", newline="").write(s)

# Fixed iPhone-frame offsets -> safe-area tokens. Identical when --safe-top is 62px
# and --safe-bottom is 34px (the iPhone 17 Pro frame the mockups use).
rw("src/app.css", [
    (".top-fade { position: absolute; inset: 0 0 auto 0; height: 58px;", ".top-fade { position: absolute; inset: 0 0 auto 0; height: calc(var(--safe-top) - 4px);"),
    ("  padding: 66px var(--margin) 0 20px; }", "  padding: calc(var(--safe-top) + 4px) var(--margin) 0 20px; }"),
    (".months { padding: 26px var(--margin) 128px; }", ".months { padding: 26px var(--margin) calc(var(--safe-bottom) + 94px); }"),
    (".tabbar { position: absolute; left: 50%; bottom: 44px;", ".tabbar { position: absolute; left: 50%; bottom: calc(var(--safe-bottom) + 10px);"),
    (".bar { position: absolute; top: 58px;", ".bar { position: absolute; top: calc(var(--safe-top) - 4px);"),
    (".detail-body { position: absolute; inset: 118px 0 0 0;", ".detail-body { position: absolute; inset: calc(var(--safe-top) + 56px) 0 0 0;"),
    (".strip-wrap { margin-top: auto; padding: 0 8px 46px;", ".strip-wrap { margin-top: auto; padding: 0 8px calc(var(--safe-bottom) + 12px);"),
    (".preview-body { position: absolute; inset: 118px 0 0 0;", ".preview-body { position: absolute; inset: calc(var(--safe-top) + 56px) 0 0 0;"),
    (".actions { margin-top: auto; padding: 12px var(--margin) 46px;", ".actions { margin-top: auto; padding: 12px var(--margin) calc(var(--safe-bottom) + 12px);"),
    (".cam-view { position: absolute; left: 0; right: 0; top: 118px;", ".cam-view { position: absolute; left: 0; right: 0; top: calc(var(--safe-top) + 56px);"),
    (".cam-top { position: absolute; top: 58px;", ".cam-top { position: absolute; top: calc(var(--safe-top) - 4px);"),
    (".cam-bottom { position: absolute; left: 0; right: 0; bottom: 44px;", ".cam-bottom { position: absolute; left: 0; right: 0; bottom: calc(var(--safe-bottom) + 10px);"),
    (".cam-hint { position: absolute; left: 0; right: 0; bottom: 150px;", ".cam-hint { position: absolute; left: 0; right: 0; bottom: calc(var(--safe-bottom) + 116px);"),
    (".sheet { position: absolute; left: 8px; right: 8px; bottom: 8px;", ".sheet { position: absolute; left: 8px; right: 8px; bottom: max(8px, calc(var(--safe-bottom) - 26px));"),
    (".asheet { position: absolute; left: 8px; right: 8px; bottom: 8px;", ".asheet { position: absolute; left: 8px; right: 8px; bottom: max(8px, calc(var(--safe-bottom) - 26px));"),
    (".picker { position: absolute; left: 0; right: 0; bottom: 0; top: 70px;", ".picker { position: absolute; left: 0; right: 0; bottom: 0; top: calc(var(--safe-top) + 8px);"),
    (".page-head { padding: 116px 20px 0; }", ".page-head { padding: calc(var(--safe-top) + 54px) 20px 0; }"),
    (".toast { position: absolute; left: 50%; bottom: 108px;", ".toast { position: absolute; left: 50%; bottom: calc(var(--safe-bottom) + 74px);"),
    (".menu { position: absolute; z-index: 41; top: 144px;", ".menu { position: absolute; z-index: 41; top: calc(var(--safe-top) + 82px);"),
])
css = io.open("src/app.css", encoding="utf-8").read()
print("frame offsets left in css:", re.findall(r"(?:top|bottom|inset|padding)[^;{]*\b(?:58|66|70|108|116|118|128|144|150)px", css))

# app.js: ES module, real today, demo journal moved to src/demo.js
p = "src/app.js"
s = io.open(p, encoding="utf-8", newline="").read()
start = s.index("  // ---------- Sample journal")
end = s.index('  // Camera roll "recents"')
demo_block = s[start:end]
s = s[:start] + "  const todayKey = () => { const d = new Date(); return key(d.getFullYear(), d.getMonth(), d.getDate()); };\n\n" + s[end:]
for a, b in [
    ("""/* Photonic prototype: one renderer for the interactive prototype and the
 * static mockup frames. No build step, no dependencies.
 *
 *   Photonic.mount(phEl, { base: "photos/" })            interactive
 *   Photonic.mount(phEl, { base, ...spec, still: true })  frozen state for a mockup
 */
(() => {""", """/* Photonic app. Grew out of the approved prototype (prototype/app.js), which
 * stays untouched as the design reference.
 *
 *   mount(phEl, { photos, today, seed, base })
 */
"""),
    ("""      this.screen = ph.closest(".mini-screen, .screen");
      this.s = {
        today: TODAY,
        photos: opts.empty ? {} : seed(),""", """      this.screen = ph.closest(".mini-screen, .screen");
      this.seedFn = opts.seed || (() => ({}));
      this.s = {
        today: opts.today || todayKey(),
        photos: opts.photos || {},"""),
    ("""      if (opts.todayPhoto) this.s.photos[TODAY] = { id: opts.todayPhoto, caption: opts.todayCaption || "" };\n""", ""),
    ("Object.assign(this.s, { photos: empty ? {} : seed(),", "Object.assign(this.s, { photos: empty ? {} : this.seedFn(),"),
]:
    assert a in s, a[:80]
    s = s.replace(a, b)
a = s.index("  // Build a frozen state for a mockup frame.")
s = s[:a] + "  export function mount(ph, opts = {}) { return new App(ph, opts); }\n"
s = "\n".join(l[2:] if l.startswith("  ") else l for l in s.split("\n"))
io.open(p, "w", encoding="utf-8", newline="").write(s)

d = demo_block.replace('  const TODAY = "2026-10-09";\n', "").replace("  function seed() {", "export function seed() {")
d = "\n".join(l[2:] if l.startswith("  ") else l for l in d.split("\n"))
d = d.split("\n", 1)[1]  # drop the section comment line
io.open("src/demo.js", "w", encoding="utf-8", newline="").write(
    "// Demo journal for ?demo and the tests: 23 July to 8 October 2026, a few days missed.\n"
    "// Photos are served from demo/photos only in the demo build.\n"
    "const pad = (n) => String(n).padStart(2, \"0\");\n"
    "const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;\n"
    "export const TODAY = \"2026-10-09\";\n" + d)
print("ok")
