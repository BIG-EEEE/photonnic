# Changelog

Photonnic uses semantic versioning. The version lives in `package.json` only; the build puts it into Settings, the About page and backups. It stays below 1.0 until it has been checked on real iPhones and Android phones (M7).

## 0.2.0 (beta), 10 October 2026

### Added
- **Daily reminders**: offered right after your first saved photo (one tap turns them on, as the phone requires); one notification a day at a time you choose, in your own time zone, through Web Push and a small reminder server on the Photonnic host.
  - "Skip once today's photo is in" is an option: the server is told only the date of your latest photo.
  - The server stores the push address and its keys, the time, the time zone and that date. It never receives photos, captions or locations.
  - Turning reminders off deletes the server's copy.
- **Settings, reorganised:** Appearance, Reminders, Camera and location, Your photos (export and restore), and About with the version and links.
- **About Photonnic** (`/about/`): a public page about what Photonnic is, how it works, how your data stays private, backups, reminders, installation and who made it, with open-source notices.

### Changed
- **Name:** the app is now called **Photonnic**. Internal names are unchanged, so existing journals, settings and backups keep working.
- **Refresh:** a Refresh item in the More menu reloads the installed app and picks up any update (the Home Screen app has no browser reload button).
- **Version:** Settings showed a placeholder "1.0 (1)" since the prototype. It now shows the real version, one number for the whole app.
- **Backups:** these record the app version that made them.

### Known limitations
- **iPhone reminders** need iOS 16.4 or later and Photonnic opened from the Home Screen.
- **Delivery** depends on the phone, the browser and focus settings; no web app can guarantee it.
- **Real phones:** a reminder has not yet been confirmed on a real phone (see HANDOFF.md, M7).

## 0.1.0, 9 October 2026

- **The approved design, built:**
  - an installable, offline-capable web app (M1);
  - photos saved on the phone (M2);
  - the phone's own camera and photo library (M3);
  - calendar, captions, replace with Undo, Look Back and appearance (M4);
  - backup export and restore (M5).
