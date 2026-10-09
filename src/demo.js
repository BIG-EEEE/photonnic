// Demo journal for ?demo and the tests: 23 July to 8 October 2026, a few days missed.
// Photos are served from demo/photos only in the demo build.
const pad = (n) => String(n).padStart(2, "0");
const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const TODAY = "2026-10-09";
export function seed() {
  const plan = [
    [2026, 6, [23, 24, 25, 26, 27, 28, 29, 30, 31], [108, 51, 16, 54, 49, 13, 124, 46, 74]],
    [2026, 7, [1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 28, 29, 30, 31],
      [110, 109, 112, 85, 33, 17, 93, 103, 106, 59, 27, 47, 77, 69, 57, 111, 84, 43, 122, 88, 134, 76, 142, 65]],
    [2026, 8, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 24, 25, 26, 27, 28, 29, 30],
      [116, 118, 94, 18, 70, 81, 10, 28, 15, 19, 29, 121, 79, 141, 136, 125, 128, 62, 66, 67, 38, 37, 58, 140, 155, 104, 90]],
    [2026, 9, [1, 2, 3, 4, 5, 7, 8], [44, 11, 95, 83, 117, 71, 50]],
  ];
  const captions = {
    "2026-07-23": "First morning. Everything smells of salt.",
    "2026-07-27": "Every wall on this island is white",
    "2026-07-29": "Paddled out before the wind came up",
    "2026-07-31": "Last day of the trip",
    "2026-08-05": "Harvest started on the farm road",
    "2026-08-11": "New shoes, first proper walk",
    "2026-08-20": "This car has been parked on our street all week",
    "2026-08-22": "Walked home over the bridge",
    "2026-09-06": "The tree tunnel near Gran's house",
    "2026-09-09": "Two hours uphill for this",
    "2026-09-26": "Lighthouse in the rain",
    "2026-10-01": "Fog didn't lift until noon",
    "2026-10-05": "Front row. Ears still ringing.",
    "2026-10-07": "Nobody on the swing but the wind",
  };
  const photos = {};
  for (const [y, m, days, ids] of plan) days.forEach((d, i) => {
    const k = key(y, m, d);
    photos[k] = { id: ids[i], caption: captions[k] || "" };
  });
  return photos;
}
