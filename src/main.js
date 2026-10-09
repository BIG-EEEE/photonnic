import "./app.css";
import "./base.css";
import { mount } from "./app.js";

const ph = document.getElementById("ph");
const demo = new URLSearchParams(location.search).has("demo");

let opts = {};
if (demo) {
  const { seed, TODAY } = await import("./demo.js");
  opts = { photos: seed(), seed, today: TODAY, base: "demo/photos/" };
}
const app = mount(ph, opts);

// Follow the system appearance.
const mq = matchMedia("(prefers-color-scheme: dark)");
const setTheme = (dark) => (dark ? (ph.dataset.theme = "dark") : delete ph.dataset.theme);
setTheme(mq.matches);
mq.addEventListener("change", (e) => setTheme(e.matches));

// Hooks for the test suite, demo mode only.
if (demo) Object.assign(window, { app, toggleTheme: () => setTheme(ph.dataset.theme !== "dark") });
