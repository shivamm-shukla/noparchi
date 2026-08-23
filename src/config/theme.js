/**
 * The single source of truth for every colour, shadow and radius in NoParchi,
 * in both themes.
 *
 * Why this file is plain CommonJS .js and not .ts:
 * tailwind.config.js is loaded by Node (via Metro/Nativewind) before any
 * TypeScript transform runs, so it can only `require()` plain JS. Keeping the
 * tokens here lets all consumers read from the same object:
 *
 *   1. Tailwind class names  -> emitted as CSS variables by tailwind.config.js,
 *      so `bg-brand-surface` resolves per theme with no `dark:` prefixes
 *   2. Raw React Native colour props -> lucide `color=`, StatusBar, tab bar,
 *      none of which can take a class; see useThemeColors()
 *   3. Elevation styles, which cannot be classes at all (see src/config/elevation.ts)
 *   4. The theme toggle itself
 *
 * To retheme, edit `themes` below. Nothing else needs to change.
 *
 * ---------------------------------------------------------------------------
 * Values come from the approved landing page, docs/noparchi-landing.html.
 * Three deliberate departures from it, each for a reason the prototype never
 * had to face:
 *
 * 1. The prototype writes borders as rgba() over the surface behind them.
 *    Here they are pre-blended to solid hex, because Tailwind needs bare RGB
 *    channels for `<alpha-value>` - an rgba() token would silently break every
 *    `border-brand-border/80` in the app.
 *
 * 2. The prototype's --accent-soft and --accent-border are not roles here.
 *    They are the accent at 10% and 28%, which app code already writes
 *    directly as `bg-brand-accent/10` and `border-brand-accent/30`. Adding
 *    roles for them would be two more values to keep in step for no gain.
 *
 * 3. `on-accent` is near-black in BOTH themes, where the prototype uses white.
 *    White on the accent measures 3.05:1 in light and 2.15:1 in dark; normal
 *    body text needs 4.5:1. Near-black measures 6.53:1 and 9.28:1. The
 *    prototype only ever put white on the accent at large marketing sizes; in
 *    the app it lands on buttons a gatekeeper reads outdoors.
 *
 * Roles the prototype has no answer for - danger, warning, info, paper, scrim -
 * keep the values the app already uses for those jobs, retuned only where the
 * new surfaces demanded it. A marketing page never had to show "already used".
 */

/**
 * Raw ramps, kept only as the vocabulary the semantic roles are written in.
 * No app code should reference these directly - nothing does today, and
 * `bg-slate-800` is exactly the kind of hardcoded colour this file exists to
 * prevent.
 */
const palette = {
  // Neutrals, from the landing page's light ground down to its dark ground.
  ink: {
    0: '#FFFFFF',
    25: '#FBFBFD',
    50: '#F4F4F7',
    100: '#EEEEF1',
    200: '#ECECEE',
    250: '#EAEBEE',
    300: '#D4D5D9',
    400: '#AAADB9',
    450: '#9BA0AE',
    500: '#8A8F9E',
    600: '#6B7080',
    650: '#565B6A',
    700: '#52586B',
    750: '#3D3E45',
    800: '#25272E',
    850: '#20222A',
    880: '#191A1E',
    900: '#12141C',
    940: '#0E1016',
    970: '#08090D',
    /** The prototype's --text-primary. Also what dark text on a QR uses. */
    slate: '#0F172A',
  },
  // The brand accent, per theme, plus one step either side of each.
  green: {
    lightSoft: '#44BC89',
    light: '#0FA968',
    lightDeep: '#0C8B55',
    darkSoft: '#53D5A4',
    dark: '#22C98A',
    darkDeep: '#1BA16E',
  },
  // Status colours. The landing page has none of these.
  amber: { 400: '#FBBF24', 500: '#F59E0B', 600: '#D97706' },
  red: { 400: '#F87171', 500: '#EF4444', 600: '#DC2626' },
  sky: { 400: '#38BDF8', 600: '#0284C7' },
  text: { light: '#F2F3F5', dark: '#0F172A' },
  white: '#FFFFFF',
};

/**
 * Semantic roles, per theme. Both objects must carry exactly the same keys -
 * a role missing from one theme is a colour that silently disappears when the
 * user switches, which is why the two are written out side by side rather than
 * one spreading over the other.
 */
const themes = {
  light: {
    // Surfaces. `bg` is the ground; `surface` is what floats on it.
    // `surface-alt` and `surface-raised` are recessed insets - in light they
    // read as slightly grey wells cut into a white card, which is the inverse
    // of how they behave in dark, where they sit above the card.
    bg: palette.ink[25],
    surface: palette.ink[0],
    'surface-alt': palette.ink[50],
    'surface-raised': palette.ink[100],

    border: palette.ink[200],
    'border-strong': palette.ink[300],

    // Text, most to least prominent.
    text: palette.text.dark,
    'text-subtle': palette.ink[700],
    'text-muted': palette.ink[500],
    'text-faint': palette.ink[400],

    // Brand accent: revenue, success, primary actions. Used sparingly - one
    // highlight per view, not every icon.
    accent: palette.green.light,
    'accent-soft': palette.green.lightSoft,
    'accent-deep': palette.green.lightDeep,
    /** Foreground for anything sitting ON an accent fill. See note 3 above. */
    'on-accent': palette.ink[970],

    success: palette.green.light,
    warning: palette.amber[600],
    danger: palette.red[600],
    'danger-soft': palette.red[500],
    'on-danger': palette.white,
    info: palette.sky[600],
    neutral: palette.ink[500],

    /** Always light: a QR code has to be dark-on-light to scan at all. */
    paper: palette.white,
    'on-paper': palette.ink.slate,

    /** Scrim behind modals. Dark in both themes - that is what a scrim is. */
    scrim: 'rgba(15, 23, 42, 0.55)',
  },

  dark: {
    bg: palette.ink[970],
    surface: palette.ink[900],
    'surface-alt': palette.ink[940],
    'surface-raised': palette.ink[850],

    border: palette.ink[800],
    'border-strong': palette.ink[750],

    text: palette.text.light,
    'text-subtle': palette.ink[450],
    'text-muted': palette.ink[600],
    'text-faint': palette.ink[650],

    accent: palette.green.dark,
    'accent-soft': palette.green.darkSoft,
    'accent-deep': palette.green.darkDeep,
    'on-accent': palette.ink[970],

    success: palette.green.dark,
    warning: palette.amber[500],
    danger: palette.red[500],
    'danger-soft': palette.red[400],
    'on-danger': palette.white,
    info: palette.sky[400],
    neutral: palette.ink[600],

    paper: palette.white,
    'on-paper': palette.ink.slate,

    scrim: 'rgba(8, 9, 13, 0.80)',
  },
};

/**
 * Elevation, per theme.
 *
 * The landing page expresses this as `box-shadow: 0 1px 2px …, 0 8px 24px …` -
 * two stacked shadows, a tight contact shadow under a wide ambient one. React
 * Native takes only one shadow per view, so each level here is the ambient
 * half, which is the half that does the visible lifting.
 *
 * `elevation` is Android's separate, non-negotiable channel; it is tuned to
 * look like the same lift rather than to match the numbers.
 */
const elevations = {
  light: {
    card: {
      shadowColor: palette.ink.slate,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.05,
      shadowRadius: 24,
      elevation: 2,
    },
    hero: {
      shadowColor: palette.ink.slate,
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.1,
      shadowRadius: 60,
      elevation: 8,
    },
  },
  dark: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 30,
      elevation: 2,
    },
    hero: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 30 },
      shadowOpacity: 0.55,
      shadowRadius: 80,
      elevation: 8,
    },
  },
};

/** Corner radii, from the landing page's --radius-* scale. */
const radii = {
  /** Panels and the big framed "window" surfaces. */
  panel: 22,
  /** Cards. */
  card: 16,
  /** Buttons, inputs, icon chips. */
  control: 10,
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

/** The CSS custom properties for one theme, e.g. { '--np-surface': '18 20 28' }. */
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
 * variables hold bare channels rather than finished colours - and why every
 * border above is a solid hex rather than the prototype's rgba().
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
  elevations,
  radii,
  ROLES,
  cssVariablesFor,
  tailwindColors,
};
