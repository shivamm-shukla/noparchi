/**
 * Colours are NOT defined here - they come from src/config/theme.js, which is
 * also what the runtime reads for raw React Native colour props. Edit that file
 * to retheme the app.
 *
 * The semantic roles are emitted as CSS custom properties for both themes and
 * referenced by the `brand-*` colours, so a class like `bg-brand-surface` needs
 * no `dark:` counterpart - switching theme swaps the variable underneath it.
 *
 * @type {import('tailwindcss').Config}
 */
const plugin = require('tailwindcss/plugin');
const { palette, cssVariablesFor, tailwindColors } = require('./src/config/theme.js');

module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  // Toggled at runtime by nativewind's colorScheme.set(); see ThemeContext.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: palette.slate,
        emerald: palette.emerald,
        amber: palette.amber,
        rose: palette.rose,
        sky: palette.sky,
        violet: palette.violet,
        /** Semantic roles. Prefer these: bg-brand-surface, text-brand-muted. */
        brand: tailwindColors(),
      },
      fontFamily: {
        sans: ['System', 'sans-serif'],
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        // Light is the base declaration so that any context which cannot
        // resolve a scheme still gets a complete, readable palette rather than
        // undefined variables.
        ':root': cssVariablesFor('light'),
        // Follows the device when the user has not chosen explicitly.
        '@media (prefers-color-scheme: dark)': { ':root': cssVariablesFor('dark') },
        // An explicit choice wins over the device in both directions.
        '.dark:root': cssVariablesFor('dark'),
        '.light:root': cssVariablesFor('light'),
      });
    }),
  ],
};
