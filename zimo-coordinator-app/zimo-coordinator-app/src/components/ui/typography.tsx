import React from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  PixelRatio,
  type TextProps,
  type TextInputProps,
} from 'react-native';

/*
  ── WHY THE APP LOOKED ZOOMED ────────────────────────────────────────────

  The design is drawn at a fixed scale. The prototype says so outright:

      <meta name="viewport" content="... maximum-scale=1.0, user-scalable=no">

  inside a 480px column, with type at 10, 11, 13, 15 and 17px and a bottom
  nav whose items are 52px tall. Every one of those numbers assumes the
  text is the size the designer drew it.

  React Native has no viewport tag. Its text obeys the DEVICE's font-scale
  setting, and on Android that setting is not exotic — "Display size" and
  "Font size" are two taps from the home screen, plenty of phones ship
  with them raised, and a field agent squinting at a screen outdoors is
  exactly the person who turns them up.

  At 1.3x the 10px nav labels render at 13 and the 20px emoji icons at 26,
  inside a tab bar still 56px tall. Everything is bigger than the box drawn
  for it, so it overflows, clips and wraps. That reads as "the screen is
  zoomed in", and it is: the type is zoomed and nothing else moved.

  ── WHY A CAP AND NOT allowFontScaling={false} ───────────────────────────

  Refusing to scale at all would fix the layout and take the accessibility
  setting away from the people most likely to need it. This lets text grow
  by a fifth, which is enough to help and not enough to break a layout, and
  it is a single number to change if the field says otherwise.

  ── WHY A WRAPPER AND NOT A GLOBAL DEFAULT ───────────────────────────────

  `Text.defaultProps.maxFontSizeMultiplier = …` was the usual trick and it
  is gone: React 19 dropped defaultProps for function components, and
  React Native's Text is a forwardRef. Setting it now does nothing at all
  — silently, which is worse than an error. So the cap lives on a wrapper
  and screens import Text from here.
*/
export const MAX_FONT_SCALE = 1.2;

/*
  ── AND THE FONT REACHES EVERY SCREEN FROM HERE ──────────────────────────

  Nothing loaded a font before this, so the whole app rendered in whatever
  the handset shipped. Poppins is loaded in the root layout; this is what
  makes the 250-odd Text elements use it without every one of them saying
  so.

  It is the DEFAULT and not an override: a `font-semibold` class, or a
  style passed in, still wins. Android will not synthesise a bold from a
  regular face, so a weight class has to resolve to its own loaded family
  — see tailwind.config.js.
*/
const BODY_FACE = 'Poppins_400Regular';

/** Text that grows with the reader's setting, up to where the layout holds. */
export function Text({ maxFontSizeMultiplier, style, ...rest }: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE}
      style={[{ fontFamily: BODY_FACE }, style]}
      {...rest}
    />
  );
}

/** The same cap for anything typed into, so a field does not outgrow its box. */
export function TextInput({ maxFontSizeMultiplier, style, ...rest }: TextInputProps) {
  return (
    <RNTextInput
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_FONT_SCALE}
      style={[{ fontFamily: BODY_FACE }, style]}
      {...rest}
    />
  );
}

/**
 * What a fixed-height container has to grow by to still hold its text.
 *
 * A bar sized in raw pixels is a bar that clips the moment type scales.
 * The prototype never has this problem because its nav is `min-height`
 * around its content; this is how a native container reaches the same
 * place when it has to state a height.
 *
 * Clamped at both ends: the device scale is honoured up to the cap above,
 * and never shrinks a container below what it was drawn as.
 */
export function scaled(size: number): number {
  return Math.round(size * Math.min(Math.max(PixelRatio.getFontScale(), 1), MAX_FONT_SCALE));
}
