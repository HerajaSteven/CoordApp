const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const config = getDefaultConfig(__dirname);
/*
  ── WHY inlineRem IS FALSE ───────────────────────────────────────────────

  NativeWind's default is 14, and it is the reason the app read as zoomed
  out on every device.

  Tailwind's scale is in rem: `text-sm` is 0.875rem, `p-4` is 1rem. With
  rem inlined at 14 those compile to 12.25 and 14 instead of 14 and 16 —
  so every size in the app, type and spacing alike, rendered at 87.5% of
  what it says in the class name. Uniformly shrunk with the proportions
  intact, which is exactly what "zoomed out" looks like and why chasing it
  through font sizes found nothing wrong.

  `false` keeps rem a runtime value instead, which does two things: the
  scale is correct at 16, and it can be SET per device — see the root
  layout, where it is derived from the width of the screen so the design
  occupies the same proportion of a small phone and a large one.
*/
module.exports = withNativeWind(config, {
  input: "./src/theme/globals.css",
  inlineRem: false,
});
