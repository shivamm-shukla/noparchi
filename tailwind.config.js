/**
 * Colours are NOT defined here - they come from src/config/theme.js so that
 * Tailwind classes and raw React Native colour props stay in sync. Edit that
 * file to retheme the app.
 *
 * @type {import('tailwindcss').Config}
 */
const { palette, semantic } = require('./src/config/theme.js');

module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        slate: palette.slate,
        emerald: palette.emerald,
        amber: palette.amber,
        rose: palette.rose,
        sky: palette.sky,
        violet: palette.violet,
        /** Semantic roles: prefer these (bg-brand-surface, text-brand-muted). */
        brand: semantic,
      },
      fontFamily: {
        sans: ['System', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
