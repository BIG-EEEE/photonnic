import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The one source of the version: package.json. Shown in Settings, the About page and backups.
const VERSION = JSON.parse(fs.readFileSync("package.json", "utf8")).version;

// Demo photos live in prototype/photos. They are served by the dev server and
// copied into the demo build only, never into the production build.
function demoPhotos(mode) {
  const src = path.resolve("prototype/photos");
  let outDir;
  return {
    name: "photonic-demo-photos",
    configResolved(c) { outDir = c.build.outDir; },
    configureServer(server) {
      server.middlewares.use("/demo/photos", (req, res, next) => {
        const f = path.join(src, path.basename(req.url.split("?")[0]));
        if (!fs.existsSync(f)) return next();
        res.setHeader("Content-Type", "image/jpeg");
        fs.createReadStream(f).pipe(res);
      });
    },
    closeBundle() {
      if (mode === "demo") fs.cpSync(src, path.join(outDir, "demo/photos"), { recursive: true });
    },
  };
}

export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  build: {
    target: "es2022",
    rollupOptions: { input: { app: path.resolve("index.html"), about: path.resolve("about/index.html") } },
  },
  plugins: [
    demoPhotos(mode),
    { name: "photonic-version", transformIndexHtml: (html) => html.replaceAll("%APP_VERSION%", VERSION) },
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      includeAssets: ["icons/apple-touch-icon.png", "icons/favicon-32.png"],
      manifest: {
        id: "/",
        name: "Photonnic",
        short_name: "Photonnic",
        description: "Your life, one photo at a time.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F8F7F4",
        theme_color: "#F8F7F4",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The app shell only. Photos live in IndexedDB, not in the cache.
        globPatterns: ["**/*.{js,css,html,png,webmanifest}"],
        globIgnores: ["demo/**"],
        navigateFallback: "index.html",
        // The reminder API and the public About page are never answered with the app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/about/],
        importScripts: ["push-sw.js"],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}));
