/**
 * The single source of truth for every colour in NoParchi, in both themes.
 *
 * Why this file is plain CommonJS .js and not .ts:
 * tailwind.config.js is loaded by Node (via Metro/Nativewind) before any
 * TypeScript transform runs, so it can only `require()` plain JS. Keeping the
 * tokens here lets all three consumers read from the same object:
 *
 *   1. Tailwind class names  -> emitted as CSS variables by tailwind.config.js,
 *      so `bg-brand-surface` resolves per theme with no `dark:` prefixes
 *   2. Raw React Native colour props -> lucide `color=`, StatusBar, tab bar,
 *      none of which can take a class; see useThemeColors()
 *   3. The theme toggle itself
 *
 * To retheme, edit `themes` below. Nothing else needs to change.
 */

/** Raw ramps. Prefer the semantic roles below in app code. */
const palette = {
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    850: '#131E35',
    900: '#0F172A',
    950: '#090D16',
  },
  emerald: {
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    900: '#064E3B',
    950: '#022C22',
  },
  amber: { 400: '#FBBF24', 500: '#F59E0B', 600: '#D97706' },
  rose: { 400: '#FB7185', 500: '#F43F5E', 600: '#E11D48' },
  red: { 400: '#F87171', 500: '#EF4444', 600: '#DC2626' },
  sky: { 400: '#38BDF8', 500: '#0EA5E9', 600: '#0284C7' },
  violet: { 400: '#A78BFA', 500: '#8B5CF6' },
  white: '#FFFFFF',
  black: '#000000',
};

/**
 * Semantic roles, per theme. Both objects must carry exactly the same keys -
 * a role missing from one theme is a colour that silently disappears when the
 * user switches, which is why the two are written out side by side rather than
 * one spreading over the other.
 *
 * The dark theme is the original NoParchi look: deep slate with emerald.
 * The light theme is the same product in daylight - white cards on a soft grey
 * ground, with the accent darkened to emerald-600 because emerald-500 on white
 * does not carry enough contrast to read as a button.
 */
const themes = {
  dark: {
    // Surfaces, darkest to lightest
    bg: palette.slate[950],
    surface: palette.slate[900],
    'surface-alt': palette.slate[850],
    'surface-raised': palette.slate[800],

    border: palette.slate[800],
    'border-strong': palette.slate[700],

    // Text, most to least prominent
    text: palette.slate[100],
    'text-subtle': palette.slate[300],
    'text-muted': palette.slate[400],
    'text-faint': palette.slate[500],

    // Brand accent: revenue, success, primary actions
    accent: palette.emerald[500],
    'accent-soft': palette.emerald[400],
    'accent-deep': palette.emerald[600],
    /** Foreground for anything sitting ON an accent fill. */
    'on-accent': palette.slate[900],

    success: palette.emerald[500],
    warning: palette.amber[500],
    danger: palette.red[500],
    'danger-soft': palette.red[400],
    'on-danger': palette.white,
    info: palette.sky[400],
    neutral: palette.slate[400],

    /** Always light: a QR code has to be dark-on-light to scan at all. */
    paper: palette.white,
    'on-paper': palette.slate[900],

    /** Scrim behind modals. Dark in both themes - that is what a scrim is. */
    scrim: 'rgba(2, 6, 23, 0.8)',
  },

  light: {
    bg: palette.slate[50],
    surface: palette.white,
    'surface-alt': palette.slate[100],
    'surface-raised': palette.slate[100],

    border: palette.slate[200],
    'border-strong': palette.slate[300],

    text: palette.slate[900],
    'text-subtle': palette.slate[700],
    'text-muted': palette.slate[600],
    'text-faint': palette.slate[500],

    accent: palette.emerald[600],
    'accent-soft': palette.emerald[500],
    'accent-deep': palette.emerald[700],
    'on-accent': palette.white,

    success: palette.emerald[600],
    warning: palette.amber[600],
    danger: palette.red[600],
    'danger-soft': palette.red[500],
    'on-danger': palette.white,
    info: palette.sky[600],
    neutral: palette.slate[500],

    paper: palette.white,
    'on-paper': palette.slate[900],

    scrim: 'rgba(15, 23, 42, 0.55)',
  },
};

/** Every semantic role name, derived so the two themes cannot drift apart. */
const ROLES = Object.keys(themes.dark);

/** `#10B981` -> `16 185 129`, the form Tailwind needs for `/opacity` support. */
function hexToRgbChannels(hex) {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const int = parseInt(full, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

/** The CSS custom properties for one theme, e.g. { '--np-surface': '15 23 42' }. */
function cssVariablesFor(themeName) {
  const theme = themes[themeName];
  return ROLES.reduce((acc, role) => {
    const value = theme[role];
    // rgba() strings (the scrim) are passed through: they already carry their
    // own alpha and must not be split into channels.
    acc[`--np-${role}`] = value.startsWith('#') ? hexToRgbChannels(value) : value;
    return acc;
  }, {});
}

/**
 * Tailwind colour entries pointing at those variables.
 *
 * `<alpha-value>` is what makes `bg-brand-accent/10` work, which is why the
 * variables hold bare channels rather than finished colours.
 */
function tailwindColors() {
  return ROLES.reduce((acc, role) => {
    acc[role] = themes.dark[role].startsWith('#')
      ? `rgb(var(--np-${role}) / <alpha-value>)`
      : `var(--np-${role})`;
    return acc;
  }, {});
}

module.exports = {
  palette,
  themes,
  ROLES,
  cssVariablesFor,
  tailwindColors,
};
