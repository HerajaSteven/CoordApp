/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      /*
        Poppins, in the four weights the screens actually use.

        Named rather than set as a bare default because NativeWind maps a
        weight class like `font-semibold` to fontWeight, and a custom font
        on Android does NOT synthesise weights — it renders the one face
        it was given. So each weight is its own loaded face and its own
        family name, which is why `font-semibold` alone would silently
        keep showing Regular.
      */
      fontFamily: {
        sans: ['Poppins_400Regular'],
        medium: ['Poppins_500Medium'],
        semibold: ['Poppins_600SemiBold'],
        bold: ['Poppins_700Bold'],
      },

      /*
        ── WHY THE APP READ AS TINY ───────────────────────────────────────

        It was not scaling wrongly. It matched the prototype almost
        exactly: the mock's commonest sizes are 12px (114 uses) and 14px
        (68), and this app's are text-xs at 12 (93 uses) and text-sm at 14
        (60). A faithful implementation of a design that is small for a
        phone.

        The mock is a 480px column, `margin: 0 auto`, judged on a monitor —
        about 12cm across at desk distance. The same numbers on a handset
        are 6.5cm at arm's length, so type that read comfortably in the
        browser is genuinely small in the hand. The mock's 34 elements at
        `height:18px` say the same thing: Android asks 48dp of a touch
        target.

        So the scale is raised here rather than at 199 call sites, and
        raised ABOVE the prototype rather than to it. Body text lands at
        16, which is what Android asks for body copy, and the smallest
        label at 14, which is its floor for anything a person has to read
        rather than glance at.

        These are absolute values, not a multiplier, so each one can be
        argued with on its own. Poppins also runs a little smaller than
        Roboto at the same point size, which this absorbs.
      */
      fontSize: {
        xs: '14px',    // was 12 — the app's commonest size, doing body work
        sm: '16px',    // was 14
        base: '18px',  // was 16
        lg: '20px',    // was 18
        xl: '22px',    // was 20
        '2xl': '27px', // was 24
        '3xl': '33px', // was 30
      },
      colors: {
        green: {
          DEFAULT: "#0D7A3D",
          50: "#E8F5EE",
          100: "#C3E6D1",
          500: "#0D7A3D",
          600: "#0A6233",
          700: "#084F29",
        },
        yellow: {
          DEFAULT: "#F4B400",
          50: "#FEF9E7",
          100: "#FDEFC2",
          500: "#F4B400",
        },
        red: {
          DEFAULT: "#EF4444",
          50: "#FEF2F2",
          500: "#EF4444",
        },
        bg: "#F5F7FA",
        card: "#FFFFFF",
        border: "#E8EDF3",
        text: {
          DEFAULT: "#1A2332",
          2: "#4A5568",
          3: "#8896A7",
        },
      },
    },
  },
  plugins: [],
};
