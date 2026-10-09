# Photonic: design direction

## Brief (from the client, 9 Oct 2026)

- **App:** Photonic, a personal visual diary. Take or pick one photo a day; the calendar becomes a record of your life.
- **Core action:** open the app, see your memories by date, take today's photo.
- **Feel:** personal, peaceful, lightweight. Not social, not an editor, not a productivity tool.
- **Source of truth:** the reference screenshot (`_work/ref.jpg`). Recreate the phone screen faithfully; do not reinterpret.
- **Scope:** calendar, photo detail, capture flow, preview and save, empty state, More menu and settings, navigable prototype, design system, handoff.

### How the app-designer process was adapted

The skill normally explores three different visual directions and refuses to repeat earlier looks. The client mandated a recreation of a supplied reference, so that step was replaced with **measuring the reference** (below). The skill's other gates still ran: real content first, a check on the rendered screens, a small-phone render, a separate critic, and a journey test.

## The reference, measured

The phone screen in the poster is about 228 px wide for 402 pt, so 1 pt ≈ 0.567 poster px. Zoomed captures are in `_work/zoom.png` and `_work/zoom2.png`.

| Element | Reference | Photonic |
|---|---|---|
| Side margin | ~16 to 20 pt | 20 pt title, 16 pt grid |
| Title | bold, ~28 pt | 28/34 bold, -0.5 tracking |
| Subtitle | ~12 to 13 pt, very light grey | 13/16, `ink-3` (darkened for contrast) |
| Header buttons | two white circles ~50 pt, soft shadow, label under each | 50 pt circles, 11 pt labels, 22 pt apart |
| Pending marker | small black dot on the camera button | kept: today's photo not taken yet |
| Month label | ~13 pt semibold, dark grey | 13/16 semibold `ink-2` |
| Grid | 7 columns, Sunday first, no weekday row | same |
| Thumbnail | ~45 pt square, ~11 pt radius, ~8 pt gap | 1fr columns (46 pt at 402 wide), 12 pt radius, 8 pt gap |
| Date on photo | white bold ~12 pt, bottom centre | 12 pt bold white over a bottom scrim |
| Empty day | faint tile, centred light grey number | past: `tile` + `ink-3`; future: `tile-future` + `ink-4` |
| Selected day | ring around the thumbnail (Dec 28) | ring marks today |
| Bottom bar | floating white pill ~180 × 48 pt; house, camera on a raised white knob, sparkles | 180 × 52 pt, same three icons; active tab shows filled icon in ink |

### Deviations from the reference, and why

1. **Subtitle and past empty-day numbers are darker** (`#66645F`, about 4.9:1). The reference grey is about 2:1, which fails WCAG for text people need to read.
2. **The Home icon is filled and in ink when active.** In the reference the active tab is not visible; the brief asked for clear active states.
3. **Future dates stay faint (about 1.9:1).** They are inactive, not tappable and hidden from screen readers, which WCAG exempts. Raising them to full contrast would make the unused days as loud as the lived ones. The design check flags this on every calendar frame; it is deliberate.

## Category default refused

Photo-a-day and journaling apps tend to share: a streak counter and stats dashboard, a social feed of other people's photos, a purple-to-orange gradient brand, and onboarding carousels. Photonic keeps none of them. There are no streaks, scores or reminders nagging you, no feed, and no accent colour at all: **the photos are the only colour on the page**.

## Concept and richness

**Photonic is a wall calendar you fill with your own photos.** The richness comes from the photos themselves. The interface stays neutral (warm off-white, ink, faint tiles) so a month of photos reads as one picture. Sample photos are real (Unsplash via picsum.photos, stored locally in `prototype/photos/`).

## Signature interaction: the photo lands in its day

- **Trigger:** Save on the preview screen.
- **Frames:** the preview photo (22 pt radius) shrinks along a straight path into today's square (12 pt radius) over 0.46 s with the iOS sheet curve (no overshoot). The calendar is already underneath, scrolled so today is visible. On arrival the square settles from 0.82 to 1.0 scale with a slight overshoot (0.52 s), a light haptic fires (`.success` on iOS), and the dot on Capture disappears.
- **The same flight in reverse** opens a photo from the calendar, and Back returns it to its square.
- **Reduced motion:** cross-fade only, no flight, no scale.
- Storyboard: `shots/r4/07-save-moment.png`.

## Tokens

| Role | Light | Dark |
|---|---|---|
| ground | #F8F7F4 | #121211 |
| surface (buttons, pill, lists, sheets) | #FFFFFF | #1F1F1D |
| tile (past day, no photo) | #EFEDE8 | #1C1C1A |
| tile-future | #F3F2EE | #171716 |
| ink (titles, icons, primary button) | #1C1B19 | #F2F1EE |
| ink-2 (month headings, button captions) | #4A4845 | #C9C7C2 |
| ink-3 (supporting text, past empty dates) | #66645F | #9C9A94 |
| ink-4 (future dates only) | #B2B0AA | #4A4945 |
| hairline | rgba(28,27,25,.09) | rgba(255,255,255,.09) |
| destructive (delete only) | #D23B2C | #FF5A4A |
| nav pill | rgba(255,255,255,.84) + 20 pt blur | rgba(38,38,36,.82) + blur |

**Type:** SF Pro (system font) everywhere.

| Step | Size/line | Weight | Tracking | Used for |
|---|---|---|---|---|
| Title | 28/34 | 700 | -0.5 | Screen titles: Photonic, Settings, Look back |
| Heading | 22/28 | 700 | -0.35 | Empty state, sheets, camera denied |
| Body | 17/23 | 400 / 600 | -0.4 | Captions, rows, buttons (600), detail day name (600) |
| Callout | 15/21 | 400 | -0.2 | Explanations, toasts |
| Footnote | 13/16 | 400 / 600 | -0.08 | Subtitle, month headings (600), dates under titles |
| Date | 12/1 | 400 / 700 | 0, tabular | Calendar day numbers (700 on photos) |
| Caption | 11/13 | 500 | +0.05 | Labels under the round header buttons |

**Spacing:** 4, 8, 12, 16, 20, 26 pt. Side margin 16 pt (title 20 pt). Grid gap 8 pt.
**Radii:** thumbnail 12, filmstrip 9, field 16, list group 20, large photo 22, sheet 34, buttons fully round.
**Icons:** SF Symbols, regular weight: camera.fill, ellipsis, house / house.fill, sparkles, chevron.left/right, xmark, camera.rotate, pencil, gearshape, square.and.arrow.up, info.circle, camera.slash.
**Shadows:** one float shadow (round buttons, pill), one menu shadow (menus, sheets). Nothing else casts a shadow.

## Content

- **Today:** Thursday 9 October 2026, 3:06 pm, no photo yet.
- **Journal:** began 23 July 2026; 67 photos. Missed days: 3, 9, 10, 17, 25, 26 and 27 Aug; 14, 22 and 23 Sep; 6 Oct.
- **Captions (14 of 67):** "First morning. Everything smells of salt." (23 Jul) · "Every wall on this island is white" (27 Jul) · "Paddled out before the wind came up" (29 Jul) · "Last day of the trip" (31 Jul) · "Harvest started on the farm road" (5 Aug) · "New shoes, first proper walk" (11 Aug) · "This car has been parked on our street all week" (20 Aug) · "Walked home over the bridge" (22 Aug) · "The tree tunnel near Gran's house" (6 Sep) · "Two hours uphill for this" (9 Sep) · "Lighthouse in the rain" (26 Sep) · "Fog didn't lift until noon" (1 Oct) · "Front row. Ears still ringing." (5 Oct) · "Nobody on the swing but the wind" (7 Oct). 8 Oct has no caption, to show the "Add a caption" state.
- **Today's capture in the demo:** two people on a bench, caption "Lunch on the bench with Ama".
- **Copy:**
  - Header: "Photonic" / "Your life, one photo at a time."
  - Empty state: "Start with today." / "Take one photo a day. Each one fills its square here, and month by month the calendar turns into a record of your life." / [Take today's photo]
  - Camera permission explainer: "Take today's photo" / "Photonic uses the camera only when you tap Capture. Your photos are saved on this iPhone and nowhere else." / [Continue] / Choose from library instead
  - iOS permission alert text: "So you can take one photo a day. Photos stay on this iPhone."
  - Camera off: "Camera access is off" / "Turn it on in Settings to take photos here, or pick one from your library."
  - Replace notice: "Today already has a photo. Saving replaces it." / [Choose another] [Replace photo]; afterwards the toast "Replaced the photo for 9 October" with Undo
  - Remove confirmation: "Remove the photo from 7 October? This can't be undone." / Remove photo / Cancel
  - Delete all: "Delete all 67 photos from Photonic? Photos in your iPhone library are not affected. This can't be undone."
