// eslint-disable-next-line @typescript-eslint/no-var-requires
const { radii: raw } = require('./theme.js') as {
  radii: { panel: number; card: number; control: number };
};

/**
 * Corner radii as numbers, for the places a `rounded-*` class cannot reach -
 * anything setting `borderRadius` in a style object because the size is
 * computed at runtime.
 */
export const radii = raw;
