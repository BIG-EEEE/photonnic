# Critique

The external critic agent was started but stopped early when the usage limit was reached (no scores returned), so both rounds are **self-scored**, deliberately strictly. Treat them as the designer's own judgement, not fresh eyes.

Rubric: app-designer `references/critique.md`, plus a 13th line, Fidelity to the reference.

## Round 1 (shots/r4)

| # | Line | Score | Evidence |
|---|---|---|---|
| 1 | Concept on the pixel | 4 | Cover the name and the photo-filled month grid still says "a calendar of my days". |
| 2 | Not the category average | 4 | No streaks, feed or gradient brand; the only colour is the user's photos. |
| 3 | Not this skill's average | 4 | Warm ground and photo-led; settings uses the same round controls and type, not a bolted-on grey list. |
| 4 | Hierarchy | 4 | The photo grid lands first on the calendar; the photo on detail and preview. |
| 5 | Typography | 3 | Scale has contrast (28/22/17/15/13/12/11) but renders in Inter on this machine; SF on device is unverified. |
| 6 | Colour | 4 | Neutral system with one ink role; dark mode designed (16-calendar-dark). |
| 7 | Richness | 4 | Real, varied photography on every core screen. |
| 8 | Rhythm and space | 4 | Tight grid, generous gaps between months; detail had a dead band under the photo (fixed before r4). |
| 9 | Craft details | 3 | On a brand-new account, days 1 to 8 Oct read as eight missed days; the storyboard frame wrongly showed a status bar. |
| 10 | Native fluency | 4 | Floating pill nav, modal camera, system permission alert, PHPicker sheet, action sheets. |
| 11 | Signature | 3 | Photo flies into today's square; strong in the prototype, a static storyboard can only hint at it. |
| 12 | Feature test | 3 | Calm and well made; whether an editor features it rests on how the flight and haptic feel on a device. |
| 13 | Fidelity | 4 | Layout, header buttons, grid proportions and pill match; deliberate deviations listed in DIRECTION.md. |

**Five changes:**
1. Days before the first photo should not read as missed (empty state, July 1 to 22).
2. Storyboard frame: no status bar on the board.
3. Day squares at 375 pt are 42 pt: extend the hit area to 44 pt or more.
4. Filmstrip thumbnails are 34 pt targets: make each one 44 pt high.
5. Thumbnail date numbers must sit on the photo for contrast purposes, not on the tile colour.

## Round 2 (shots/r5)

All five landed:
- Days before the first photo now use the inactive style.
- The board has no status bar.
- Day squares have 50 pt hit areas.
- Filmstrip buttons are 42 × 44 pt.
- The photo is the background behind each date.

| # | Line | Round 1 | Round 2 |
|---|---|---|---|
| 1 | Concept on the pixel | 4 | 4 |
| 2 | Not the category average | 4 | 4 |
| 3 | Not this skill's average | 4 | 4 |
| 4 | Hierarchy | 4 | 4 |
| 5 | Typography | 3 | 3 |
| 6 | Colour | 4 | 4 |
| 7 | Richness | 4 | 4 |
| 8 | Rhythm and space | 4 | 4 |
| 9 | Craft details | 3 | 4 |
| 10 | Native fluency | 4 | 4 |
| 11 | Signature | 3 | 3 |
| 12 | Feature test | 3 | 3 |
| 13 | Fidelity | 4 | 4 |

**Stop rule:** no line below 3, and 10 of 13 lines at 4 or above. **Done.** The three 3s depend on things a mockup cannot show: SF Pro rendering, and motion and haptics on a real device.

## Design check

- **The one finding left:** the faint future dates (about 1.9:1), on every calendar frame. They are deliberate, matching the reference; the reason is in DIRECTION.md.
- **Warnings answered:**
  - "Text near the home indicator": calendar content scrolling under the nav pill, as on iOS.
  - "Icon-in-tinted-square chips": the empty day tiles.
  - "Shadows": two shadow styles only, float and menu.
  - "3 gradients" on settings: the top fade and the photo scrims.
- **Journey test:** `_work/journey.mjs`, 16 of 16 checks pass.
