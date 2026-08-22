/**
 * Single source of truth for every colour, radius and elevation token in NoParchi.
 *
 * Why this file is plain CommonJS .js and not .ts:
 * tailwind.config.js is loaded by Node (via Metro/Nativewind) before any
 * TypeScript transform runs, so it can only `require()` plain JS. Keeping the
 * tokens here lets BOTH consumers read from the same object:
 *   1. Tailwind/Nativewind class names  -> `bg-brand-accent`, `text-brand-muted`
 *   2. Raw React Native colour props    -> lucide `color=`, StatusBar, tab bar
 * Those raw props cannot use Tailwind classes, and duplicating the values for
 * them is exactly what produced the 125 scattered hex literals this replaces.
 *
 * To retheme the entire app, edit `semantic` below and nothing else.
 */

/** Raw ramps. Prefer `semantic` in app code - these exist so Tailwind still
 *  exposes the familiar `slate-800` / `emerald-500` scale utilities. */
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
  red: { 400: '#F87171', 500: '#EF4444' },
  sky: { 400: '#38BDF8', 500: '#0EA5E9' },
  violet: { 400: '#A78BFA', 500: '#8B5CF6' },
  white: '#FFFFFF',
  black: '#000000',
};

/**
 * Semantic roles. App code should reference THESE, never the ramps above, so a
 * rebrand is a one-line change here rather than a find-and-replace.
 */
const semantic = {
  // Surfaces, darkest to lightest
  bg: palette.slate[950],
  surface: palette.slate[900],
  surfaceAlt: palette.slate[850],
  surfaceRaised: palette.slate[800],

  // Borders
  border: palette.slate[800],
  borderStrong: palette.slate[700],

  // Text, most to least prominent
  text: palette.slate[100],
  textSubtle: palette.slate[300],
  textMuted: palette.slate[400],
  textFaint: palette.slate[500],

  // Brand accent. Revenue, success, primary actions.
  accent: palette.emerald[500],
  accentSoft: palette.emerald[400],
  accentDeep: palette.emerald[600],
  /** Foreground colour to place ON an accent-filled surface. */
  onAccent: palette.slate[900],

  // Status
  success: palette.emerald[500],
  warning: palette.amber[500],
  danger: palette.red[500],
  dangerSoft: palette.red[400],
  info: palette.sky[400],
  neutral: palette.slate[400],

  // Always-light surfaces (QR codes must be printed/scanned on white)
  paper: palette.white,
  onPaper: palette.slate[900],
};

/** Corner radii, matched to the Tailwind scale the components already use. */
const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
};

module.exports = { palette, semantic, radii };
