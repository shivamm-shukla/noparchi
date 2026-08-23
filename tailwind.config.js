/**
 * Colours, radii and fonts are NOT defined here - they come from
 * src/config/theme.js and src/config/typography.js, which are also what the
 * runtime reads for raw React Native props. Edit those files to retheme.
 *
 * The semantic roles are emitted as CSS custom properties for both themes and
 * referenced by the `brand-*` colours, so a class like `bg-brand-surface` needs
 * no `dark:` counterpart - switching theme swaps the variable underneath it.
 *
 * The raw ramps are deliberately NOT exposed as Tailwind colours. `bg-slate-800`
 * is a hardcoded colour that survives a retheme, which is the whole thing this
 * setup exists to prevent; every colour in app code goes through `brand-*`.
 *
 * @type {import('tailwindcss').Config}
 */
const plugin = require('tailwindcss/plugin');
const { cssVariablesFor, tailwindColors, radii } = require('./src/config/theme.js');
const { fontFamilies } = require('./src/config/typography.js');

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
        /** Semantic roles. The only colours app code may name. */
        brand: tailwindColors(),
      },
      borderRadius: {
        panel: `${radii.panel}px`,
        card: `${radii.card}px`,
        control: `${radii.control}px`,
      },
      fontFamily: fontFamilies,
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
        // An explicit choice wins over the device in both directions. On web
        // nativewind only ever toggles `dark`; ThemeContext adds `light`
        // itself so this rule has a class to match.
        '.dark:root': cssVariablesFor('dark'),
        '.light:root': cssVariablesFor('light'),
      });
    }),
  ],
};
