import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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
  build: { target: "es2022" },
  plugins: [
    demoPhotos(mode),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      includeAssets: ["icons/apple-touch-icon.png", "icons/favicon-32.png"],
      manifest: {
        id: "/",
        name: "Photonic",
        short_name: "Photonic",
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
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}));
