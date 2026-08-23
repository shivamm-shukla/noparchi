/**
 * Which typeface every piece of text is set in, in both scripts.
 *
 * Plain CommonJS and free of any `require()` of a font file, because
 * tailwind.config.js loads this in Node - where a `.ttf` import would throw.
 * The actual font assets live in src/config/fonts.ts, which only Metro loads.
 *
 * Two families do the work, per the approved landing page:
 *   Manrope - display and headings, tight tracking
 *   Inter   - body and UI
 *
 * And a third that is not optional: Noto Sans Devanagari for Hindi. Inter has
 * no Devanagari coverage at all, so Hindi set in it falls back to whatever the
 * OS happens to have - which breaks conjuncts and matras and looks wrong in a
 * way a Hindi reader notices immediately. Every Latin face below therefore has
 * a Devanagari counterpart at the same weight.
 *
 * Why weight is part of the family name rather than a separate `fontWeight`:
 * React Native does not synthesise weights. `fontFamily: 'Inter'` plus
 * `fontWeight: '600'` gets you Inter Regular on Android, silently. Naming the
 * face is the only thing that actually works cross-platform.
 */

/** The faces we ship. Keep this list tight - each one is ~150-400 kB. */
const FACES = {
  display: {
    semibold: { latin: 'Manrope_600SemiBold', devanagari: 'NotoSansDevanagari_600SemiBold' },
    bold: { latin: 'Manrope_700Bold', devanagari: 'NotoSansDevanagari_700Bold' },
    extrabold: { latin: 'Manrope_800ExtraBold', devanagari: 'NotoSansDevanagari_700Bold' },
  },
  body: {
    regular: { latin: 'Inter_400Regular', devanagari: 'NotoSansDevanagari_400Regular' },
    medium: { latin: 'Inter_500Medium', devanagari: 'NotoSansDevanagari_500Medium' },
    semibold: { latin: 'Inter_600SemiBold', devanagari: 'NotoSansDevanagari_600SemiBold' },
    bold: { latin: 'Inter_700Bold', devanagari: 'NotoSansDevanagari_700Bold' },
  },
};

/**
 * Tailwind `font-*` families.
 *
 * These are stacks, which is meaningful on web only: the browser falls back
 * per glyph, so a Hindi string in `font-body-medium` picks up Noto for the
 * Devanagari and nothing else changes. React Native has no such fallback and
 * takes the first entry, so on native the script is resolved explicitly
 * instead - see `familyFor` and the shared Text component.
 */
const fontFamilies = Object.entries(FACES).reduce((acc, [role, weights]) => {
  Object.entries(weights).forEach(([weight, faces]) => {
    const key = weight === 'regular' ? role : `${role}-${weight}`;
    acc[key] = [faces.latin, faces.devanagari, 'system-ui', 'sans-serif'];
  });
  return acc;
}, {});

/** Devanagari sits slightly lower and needs more line box than Latin. */
const SCRIPT_LINE_HEIGHT_SCALE = { latin: 1, devanagari: 1.18 };

/**
 * The face to actually set, given a role, a weight and the active script.
 * This is what native uses, and what makes Hindi render in Noto rather than
 * in whatever the OS substitutes.
 */
function familyFor(role, weight, script) {
  const group = FACES[role] || FACES.body;
  const faces = group[weight] || group.regular || Object.values(group)[0];
  return script === 'devanagari' ? faces.devanagari : faces.latin;
}

/** Every face name we must have loaded before painting text. */
const ALL_FACE_NAMES = Array.from(
  new Set(
    Object.values(FACES).flatMap((weights) =>
      Object.values(weights).flatMap((faces) => [faces.latin, faces.devanagari])
    )
  )
);

module.exports = {
  FACES,
  fontFamilies,
  familyFor,
  ALL_FACE_NAMES,
  SCRIPT_LINE_HEIGHT_SCALE,
};
