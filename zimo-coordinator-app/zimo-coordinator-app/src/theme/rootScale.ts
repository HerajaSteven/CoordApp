import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { rem } from 'nativewind';

/*
  ── THE SAME DESIGN ON EVERY SCREEN ──────────────────────────────────────

  Tailwind's scale is in rem — `text-sm` is 0.875rem, `p-4` is 1rem — so
  one number decides how large the whole design draws. Setting it from the
  width of the screen is what makes a card occupy the same PROPORTION of a
  small phone and a large one, instead of the same number of pixels on
  both and a different-looking app on each.

  ── WHAT THE APP WAS DOING BEFORE ────────────────────────────────────────

  NativeWind inlines rem at 14 unless told otherwise, so every size in the
  app compiled at 87.5% of what its class name said, on every device. That
  is uniform shrinkage with the proportions intact, which is why it read as
  zoomed out and why looking for it among the font sizes found nothing.

  ── WHY THE SCALING IS CLAMPED ───────────────────────────────────────────

  Pure proportionality is wrong at the ends. A tablet is not a phone held
  closer — it is held further away, and scaling type by its width would
  produce headlines an inch tall. A very small phone scaled down in
  proportion would fall below the size at which text is legible at all.

  So the range is narrow: the design gets a little room on a big screen and
  gives a little back on a small one, and nothing is allowed past the point
  where it stops being readable. Between those, the layout's own flex does
  the work — nothing in this app is pinned to a fixed width.
*/

/**
 * The width the design is drawn for.
 *
 * A modern Android phone reports 390-412dp. 390 is the low end of that,
 * chosen so the commonest handsets scale UP slightly rather than down —
 * being a little generous is the safer direction for somebody reading a
 * screen outdoors in daylight.
 */
const REFERENCE_WIDTH = 390;

/** Tailwind's own base. Every class in the app is a multiple of this. */
const BASE_REM = 16;

/*
  Roughly 6% smaller on the narrowest phones, 12% larger on a tablet. Wider
  than this and the design stops being one design.
*/
const MIN_REM = 15;
const MAX_REM = 18;

/** What the root rem should be for a screen of this width. */
export function rootRemFor(width: number): number {
  const proportional = BASE_REM * (width / REFERENCE_WIDTH);

  return Math.round(Math.min(MAX_REM, Math.max(MIN_REM, proportional)) * 100) / 100;
}

/**
 * Keeps the root rem matched to the screen, for as long as the app runs.
 *
 * Re-applied on every dimension change rather than read once at startup: a
 * foldable opening, a phone rotating, or an app resized in split screen all
 * change the width, and a scale fixed at launch would leave the design
 * sized for a screen the reader is no longer looking at.
 */
export function useRootScale(): void {
  const { width } = useWindowDimensions();

  useEffect(() => {
    rem.set(rootRemFor(width));
  }, [width]);
}
