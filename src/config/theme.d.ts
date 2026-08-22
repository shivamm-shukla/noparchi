/**
 * Types for the CommonJS token module.
 *
 * Hand-written because theme.js has to stay plain JS for tailwind.config.js to
 * require it, and TypeScript's inference over a module that builds its exports
 * from Object.keys loses the role names.
 */
export type ThemeName = 'light' | 'dark';
export type ThemeRoles = Record<string, string>;

export declare const palette: {
  slate: Record<number, string>;
  emerald: Record<number, string>;
  amber: Record<number, string>;
  rose: Record<number, string>;
  red: Record<number, string>;
  sky: Record<number, string>;
  violet: Record<number, string>;
  white: string;
  black: string;
};
export declare const themes: Record<ThemeName, ThemeRoles>;
export declare const ROLES: string[];
export declare function cssVariablesFor(theme: ThemeName): Record<string, string>;
export declare function tailwindColors(): Record<string, string>;

declare const _default: {
  palette: typeof palette;
  themes: typeof themes;
  ROLES: typeof ROLES;
  cssVariablesFor: typeof cssVariablesFor;
  tailwindColors: typeof tailwindColors;
};
export default _default;
