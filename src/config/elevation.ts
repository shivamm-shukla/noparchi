import type { ViewStyle } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { elevations } = require('./theme.js') as {
  elevations: Record<'light' | 'dark', Record<'card' | 'hero', ViewStyle>>;
};

export type ElevationLevel = 'card' | 'hero';

/**
 * The shadow style for one elevation level, in the active theme.
 *
 * Shadows cannot be Tailwind classes here. Nativewind's `shadow-*` utilities
 * compile to a web `box-shadow`, which React Native does not read; on Android
 * nothing but `elevation` produces a shadow at all. So this returns a plain
 * style object, applied through `style=` rather than `className=`.
 *
 * Dark mode gets its own, heavier values - a shadow tuned for a white ground
 * is invisible on a near-black one, which is how "cards float" quietly becomes
 * "cards are flat" the moment someone switches theme.
 */
export function elevation(level: ElevationLevel, scheme: 'light' | 'dark'): ViewStyle {
  return elevations[scheme][level];
}
