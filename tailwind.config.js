/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./constants/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        slate: {
          950: "#090D16",
          900: "#0F172A",
          850: "#131E35",
          800: "#1E293B",
          700: "#334155",
          600: "#475569",
        },
        emerald: {
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
          900: "#064E3B",
          950: "#022C22",
        },
        brand: {
          dark: "#0F172A",
          card: "#1E293B",
          accent: "#10B981",
          gold: "#F59E0B",
          danger: "#EF4444",
          surface: "#F8FAFC",
        },
      },
      fontFamily: {
        sans: ["System", "sans-serif"],
      },
    },
  },
  plugins: [],
};
