# Photonic: design report and developer handoff

9 October 2026. Design phase complete. The build is under way: see **Build status** at the end, which supersedes the prototype notes below.

## Files

| Path | What |
|---|---|
| `prototype/index.html` | Navigable prototype. Open in Chrome or Safari; on a phone it fills the screen. |
| `prototype/app.js`, `app.css` | The prototype's renderer and the design tokens. The same code draws the mockups. |
| `mockup.html` | All screens as still frames |
| `shots/r5/` | 3x PNGs of every screen, plus `sheet.png` |
| `shots/r5-se/` | The same screens at small-phone size (375 × 667) |
| `DIRECTION.md` | Reference measurements, deviations, tokens, type scale, content and copy |
| `CRITIQUE.md` | Scores per round, and design-check results |
| `_work/journey.mjs` | The scripted test of the 11-step journey |

## What was designed (17 frames + icon)

1. Calendar (the reference recreation)
2. Photo detail
3. Camera permission explainer
4. iOS permission alert
5. Camera
6. Preview and save
7. Save moment storyboard
8. Replace an existing photo
9. Library picker
10. Remove confirmation
11. Empty state
12. More menu
13. Settings
14. Camera access off
15. Look back
16. Calendar in dark mode
17. Calendar on Pro Max

Plus the app icon. Every screen is also rendered at 375 × 667.

## What the prototype really does, and what it only shows

**Working, and tested by script (16 checks pass):**
- **Calendar:** built from data. Months run newest first, weeks start on Sunday, and missed days and future days have their own styles.
- **Photo detail:**
  - Opens with the shared-element flight from the thumbnail.
  - Previous and next buttons skip days without photos.
  - Swipe with 1:1 tracking and velocity, keyboard arrows and the filmstrip all move between days.
  - Captions can be edited.
  - Remove has a confirmation step.
- **Capture:**
  - The explainer, then the permission alert (Allow, or Don't Allow leading to the "access off" screen).
  - The shutter with a flash, and switching camera.
  - Preview with a caption field.
  - Save flies the photo into today's square and clears the Capture dot.
  - Saving when today already has a photo becomes **Replace**, with an Undo toast.
- **Library:** tapping a past missed day opens the picker for that date.
- **Menus:** the More menu opens Settings and About. Delete all photos (with confirmation) leads to the empty state.
- **Other:**
  - Look back tab.
  - Light and dark mode.
  - Pressed states on pointer-down.
  - Reduced-motion fallback.
  - "Use a photo from this device" in the side panel, which takes a real photo through the same preview flow.

**Shown but not real:**
- **Camera:** the viewfinder is a still sample photo, not a live camera.
- **Permission and picker:** the iOS alert and photo picker are replicas.
- **External actions:** Export and "Open Settings" only show a toast.
- **Persistence:** photos are kept in memory and reset on reload.

## Reusable components

| Component | Variants and states |
|---|---|
| `RoundButton` | 50 pt (header, with a caption under it) and 44 pt (top bars); optional dot badge; pressed state |
| `DayCell` | photo, photo + today ring, today without a photo, past missed (tappable), inactive (future or before the first photo); label = "Wednesday 7 October, photo"; 50 pt hit area |
| `MonthGrid` | title + 7-column grid with leading blanks, built from one month |
| `FloatingTabBar` | 180 × 52 pill, three slots, active = filled icon in ink; the camera slot is an action, not a tab |
| `TopBar` | leading round button, centred two-line title, trailing round button or a text button ("Done") |
| `PhotoFrame` | 22 pt radius, fills the space left over; swipeable on detail |
| `Filmstrip` | 34 pt thumbs in 42 × 44 targets, current one ringed, kept centred |
| `CaptionField` | display / empty ("Add a caption") / editing (120 characters max) |
| `Button` | primary (ink), secondary (white + hairline), plain; 52 pt tall, fully round |
| `Sheet`, `ActionSheet`, `Menu`, `Toast` | bottom sheet (34 pt radius) · iOS action sheet with a destructive row · pull-down menu anchored to More · toast with an optional Undo |
| `GroupedList` | 20 pt radius group, 52 pt rows, value + chevron, footer text |

## Key decisions

- **Fidelity first:** the calendar matches the reference. The three deviations (darker grey text, filled active tab icon, faint future dates kept on purpose) are in DIRECTION.md.
- **One photo per day:** saving to a day that already has a photo always says so ("Replace photo") and offers Undo; no duplicates are created.
- **Camera for today, library for any past day:** missed days are filled from the library, because a camera photo of today on a past date would be false.
- **Before you start, nothing counts as missed:** days before the first photo are inactive, so a new user doesn't open the app to a row of failures.
- **No streaks, scores, stats or reminders.** A daily reminder is the obvious next request; it is left out on purpose (see the open questions).
- **The photos are the only colour.** The interface is ink on warm off-white, and red appears only for delete.

## Edge cases to implement

- **Time zones and midnight:**
  - "Today" is the device's local date.
  - A capture started at 23:58 and saved after midnight saves to the day it was started on (the preview shows that date).
  - Travel across time zones can change "today": store the date key (`YYYY-MM-DD`), never a timestamp alone.
- **Photo date when picking from the library:** the photo's own date is ignored; it goes to the day you chose.
- **Permissions:** camera access denied or restricted leads to the "access off" screen, with library as the way forward. The library needs no permission when using the system picker (PHPicker / Android Photo Picker).
- **Large photos:** downscale on import, roughly 2048 px on the long edge for the full image and 256 px for thumbnails. Never draw full-size images into grid cells.
- **Long captions:** 120 characters maximum; the detail view wraps to 3 lines.
- **Accessibility:** each day cell is labelled like "Wednesday 7 October, photo"; future days are hidden from screen readers; Dynamic Type grows captions and lists, while the grid stays 7 columns.
- **Storage:** if the device is full, the save fails with "Not enough space on this iPhone to save the photo." and the preview stays open.

## Implementation recommendation: an installable web app (PWA)

| | React Native + Expo | Flutter | Installable web app |
|---|---|---|---|
| Speed today | medium: new project, native build | medium: new project, Dart | **fastest: this prototype is already the UI** |
| Camera and photos | excellent (expo-camera, image-picker) | excellent | good: `<input type=file capture>` opens the phone's own camera; the system picker for the library |
| Calendar | build it (FlashList) | build it | already built (CSS grid) |
| Devices | iOS + Android, App Store review needed | iOS + Android, review needed | any phone with a browser, installed from Safari or Chrome, **live today** |
| Risk | Apple developer account, signing, review: days | same | iOS Safari can clear data for sites not used for weeks; **installed home-screen apps are exempt**, and Export gives a backup |

**Recommendation:** ship a PWA today on your existing hosting (for example `photonic.afrimallgroup.com`). Move to Expo later only if App Store presence matters. The design tokens and components above map directly to React Native.

### Architecture (PWA)

- **UI:** the prototype's `app.js` and `app.css`, split into modules; no framework needed. Optional: Vite for bundling.
- **Data:** IndexedDB (through the small `idb` library). Store `photos` as `{date: "2026-10-09", full: Blob, thumb: Blob, caption, createdAt, updatedAt}`, keyed by date. One record per day is the "one photo per day" rule.
- **Capture:** `<input type="file" accept="image/*" capture="environment">` for the camera, and the same without `capture` for the library. Downscale with `createImageBitmap` and `OffscreenCanvas`, then save as JPEG at quality 0.85.
- **Offline and install:** a service worker caching the app shell, `manifest.webmanifest` with icons, and `navigator.storage.persist()` on the first save.
- **Export:** zip on the device (`fflate`) of `YYYY-MM-DD.jpg` plus `captions.json`, through the Web Share API, with a download as fallback.
- **Hosting:** static files on cPanel over HTTPS (required for install and the camera).

### Build sequence

| # | Milestone | Depends on | Estimate |
|---|---|---|---|
| 1 | Split the prototype into modules, add the service worker and manifest, make it installable | none | 1 h |
| 2 | IndexedDB store, replacing seed data with real records; load and save | 1 | 1.5 h |
| 3 | Real capture and library input, downscale and thumbnails; save with the flight | 2 | 1.5 h |
| 4 | Detail, caption edit, replace, remove and delete all against the store | 2 | 1 h |
| 5 | Export as a zip, storage persistence, "add to home screen" hint | 2 | 1 h |
| 6 | Real-device pass on iPhone and Android: safe areas, camera, dark mode, VoiceOver | 3–5 | 1 h |
| 7 | Deploy to the subdomain over HTTPS | 6 | 0.5 h |

**About 7 to 8 hours of build after design.** For Expo instead, expect about 2 days, plus App Store review.

## Open questions and risks

1. **Daily reminder:** wanted? It is left out to keep the app calm. On iOS, web push only works for an installed PWA.
2. **Backup beyond Export:** iCloud or Google Drive sync means a native app or an account system; neither is in scope.
3. **Time zone rule:** confirm that "the day it was started on" is right for late-night captures.
4. **Look back:** confirm the sparkle tab's content (same day in earlier months, plus your first photo).
5. **Fonts:** mockups were rendered on Windows with Inter standing in for SF Pro. Spacing should hold on an iPhone; check it on a device.
6. **Motion and haptics** were judged in a desktop browser; the feel on a device is unverified. `navigator.vibrate` does nothing on iOS Safari.
7. **Sample photos** come from picsum.photos (Unsplash licence) and are for the prototype only.

---

## Build status (updated 9 October 2026)

Live test build: **https://photonnic.destinyfamily.org**

| Milestone | State | Commit |
|---|---|---|
| M1 Installable, offline shell of the approved design | Done | 148dc0d |
| M2 Photos stored on the phone (IndexedDB) | Done | 48844a7 |
| M3 Phone's own camera and photo picker, resizing, EXIF date and GPS | Done | 48844a7 |
| Appearance: System / Light / Dark | Done | bf51db0, 551021d |
| M4 Calendar and memories finished (Look Back, captions, theme first paint) | Done | 551021d |
| M5 Backup export and restore | Done | 7ec93a8 |
| M6 Daily reminders (server, Settings, About page, Photonnic name, 0.2.0) | Built and deployed; phone delivery to confirm | 7518c55 |
| M7 Real-device QA | Not started | |

### What the app really does now

Everything in the prototype is real except reminders. Photos, captions, dates and locations are stored in IndexedDB on the phone. Capture opens the phone's own camera or photo picker. Export makes a real zip, and restore reads one back. Nothing is uploaded anywhere. `?demo` loads the sample journal into memory only and never opens the real database.

### Tests: `npm test`

It builds both versions, then runs three suites:

| Suite | Checks | What it proves |
|---|---|---|
| `tests/unit.mjs` | 111 | Local dates in five time zones and across daylight saving changes; photo sizing and file checks; the backup format round trip; 25 kinds of bad archive refused |
| `tests/run.mjs` | 39 | Calendar, detail, empty and dark screens match the approved renders pixel for pixel; the demo journey with real file pickers; appearance; production starts empty, installable, offline |
| `tests/prod.mjs` | 83 | Production build with real IndexedDB, file pickers and downloads |

**Last run (0.2.0): 318 passed, 0 failed:** unit 111, server 46 (`php server/tests/run.php`), design and journey 39, production 122.

`tests/prod.mjs` reads the stored data back for every check. It covers:
- capture and save;
- orientation, very large, small, corrupt and non-photo files;
- a cancelled picker and a full phone (quota) on save;
- replace and Undo, captions, remove and delete-all;
- reload and close/reopen;
- location: off by default, opt-in, denied, unavailable, and never substituted for library photos;
- appearance, including no start-up flash;
- offline launch and saving;
- export (download and share);
- restore into a clean install, conflicts (Keep / Replace / Cancel), and eight bad archives;
- a full phone during restore, which rolls back completely;
- Look Back with real records;
- demo isolation;
- a database left by an older build;
- a 320 pt phone with safe areas.

The Web Share sheet is stubbed in the share test, because desktop automation cannot press a system sheet.

### Backup format (version 1)

`photonic-backup-YYYY-MM-DD.zip`, made on the phone:

- `photos/<date>.<jpg|png|webp>`: the saved image, byte for byte.
- `manifest.json`: `{ format: "photonic-backup", version: 1, createdAt, count, entries: [...] }`. Each entry has the date, file, type, bytes, caption, `takenAt`, `dateSource`, location `{ lat, lng, source }` or null, width, height, `createdAt` and `updatedAt`.

The full description is in `src/backup.js`.

- **Thumbnails and internal ids are not stored.** They are rebuilt on restore.
- **A newer version is refused** with "update the app". Older versions will be lifted in `migrate()` once version 2 exists.

**Before anything is written, restore checks:**
- that the file is a zip with a valid manifest, format and version;
- that every date is real and not in the future;
- that file names are safe, with no `..`, absolute paths or backslashes;
- limits: 600 MB per archive, 1 GB uncompressed, 25 MB per photo, 5,000 files;
- that no day appears twice;
- that every photo is really an image, judged by its bytes and then fully decoded.

**Conflicts get one question:** keep mine, or use the backup's. All days are then written in one transaction, so any failure leaves the journal unchanged.

### Deploying an update

The site is on the destinyt cPanel; the docroot is `~/public_html/photonnic.destinyfamily.org`.

1. Run `npm test`. Everything must pass.
2. Run `npm run build`, then `tar --force-local -czf photonic-dist.tgz -C dist .`
3. Copy it to the server: `scp -i ~/.ssh/stormerhost_key photonic-dist.tgz destinyt@172.93.108.60:~/`
4. On the server, swap `assets/` and unpack: `D=public_html/photonnic.destinyfamily.org; rm -rf $D/assets.old; mv $D/assets $D/assets.old; tar -xzf ~/photonic-dist.tgz -C $D && rm -rf $D/assets.old ~/photonic-dist.tgz`
5. Never deploy `dist-demo/`.

How the server is set up:
- **`.htaccess`:** the cPanel block, then a `Photonic` block (no-cache for the app shell, long cache for hashed assets, security headers), then a `Photonic https` redirect.
- **Certificate renewal:** the redirect skips `/.well-known/`, so Let's Encrypt (AutoSSL) renewals keep working.

### Still needs a real phone

- **Status bar area:** on an iPhone, from the home screen; also the notch and Dynamic Island in light and dark.
- **Photo dates and GPS:** whether iPhone Safari keeps them on photos picked from the library.
- **Camera:** opening, and Retake, from the installed app.
- **Export:** the share sheet on iPhone and Android, and that the zip arrives in Files or Drive.
- **Restore:** a backup from one phone restored onto another.
- **Persistent storage:** whether the browser grants it, which is untested on a phone.
- **Feel:** motion and haptics.

### Reminders (0.2.0)

**On the server (destinyt cPanel):**
- **Code:** `~/photonic-push/`, outside the web root: `lib.php`, `api.php`, `worker.php`, `setup.php`.
- **Secrets:** `config.php`, created once by `setup.php` and readable by the account only. It holds the VAPID key pair and is never committed.
- **Database:** `data/push.sqlite`.
- **API front door:** `public_html/photonnic.destinyfamily.org/api/index.php` plus `.htaccess`.
- **Cron, every five minutes:** `0-59/5 * * * * /opt/cpanel/ea-php84/root/usr/bin/php /home2/destinyt/photonic-push/worker.php >/dev/null 2>&1`. The old crontab is saved as `~/crontab.bak-*`.
- **To update the server code:** copy the four PHP files into `~/photonic-push/`. Never re-run `setup.php`: a new key pair would break every existing subscription.

**Verified:**
- The encryption matches the RFC 8291 test vector byte for byte, and the signing key passes its check.
- The live worker sent to Google's push service, which accepted it (201).
- A repeated run sent nothing.
- Turning reminders off deleted the row.

**Not verified:** a notification actually appearing. Automated desktop Chrome did not display it (its push channel appears blocked under automation), so this must be confirmed on a real phone.

**Data the server holds per subscription:** the push endpoint and its keys, the time, the time zone, the skip choice, the last photo date (only with skip on), and delivery bookkeeping. Nothing else.
