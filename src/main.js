import "./app.css";
import "./base.css";
import { mount } from "./app.js";
import { openIdbStore, createMemoryStore } from "./store.js";

const ph = document.getElementById("ph");
// The sample journal exists only in the demo build: production drops this code entirely.
const demo = import.meta.env.MODE === "demo" && new URLSearchParams(location.search).has("demo");

// The demo journal lives in memory only and never opens the real database,
// so ?demo and the tests cannot touch anyone's photos.
let store, extra = {}, problem = "";
if (demo) {
  const { seed, TODAY } = await import("./demo.js");
  const records = () => Object.entries(seed()).map(([date, p]) => {
    const url = `demo/photos/p${p.id}.jpg`;
    return { date, id: `demo-${p.id}`, caption: p.caption, thumb: url, image: url, dateSource: "today" };
  });
  store = createMemoryStore(records());
  extra = { seed: records, today: TODAY };
} else {
  try {
    store = await openIdbStore();
  } catch (e) {
    // Private browsing or a locked-down browser: still usable, but say photos won't stay.
    store = createMemoryStore();
    problem = e.message;
  }
}

const app = mount(ph, {
  store,
  days: await store.list(),
  locate: await store.getSetting("locate", false),
  theme: await store.getSetting("theme", "system"),
  reminder: await store.getSetting("reminder", null),
  ...extra,
});
if (problem) app.toast(problem);
app.repairThumbs();
app.initReminders(); // never awaited: the journal does not wait for the reminder server

// Hooks for the test suite, demo mode only.
if (demo) Object.assign(window, { app, toggleTheme: () => { app.s.theme = ph.dataset.theme === "dark" ? "light" : "dark"; app.applyTheme(); } });
