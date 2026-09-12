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
        ── NO fontSize OVERRIDE HERE, DELIBERATELY ────────────────────────

        There was one, in absolute pixels, written when the app looked
        small and the cause was still unknown. It would have half-worked
        and hidden the real fault: absolute sizes escape rem, so the type
        would have come right while every padding, margin and gap stayed
        shrunk — a design pulled out of proportion rather than restored.

        The fault was `inlineRem`, defaulting to 14, which rendered the
        whole scale at 87.5%. With it off, Tailwind's own rem values are
        correct again and respond to the root rem the app sets per device.
        See metro.config.js and the root layout.
      */
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
