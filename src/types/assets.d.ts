/**
 * Font files imported by path.
 *
 * `expo/types` declares the image formats but not `.ttf`, and src/config/fonts.ts
 * imports each face directly rather than through its package index - see the
 * note there about the 8.5 MB the barrels pulled in.
 *
 * Typed as `number` to match how Expo declares its other asset modules: Metro
 * replaces the import with an asset registry id on native. On web it is a URL
 * string, but every consumer here hands it straight to `useFonts`, which takes
 * either.
 */
declare module '*.ttf' {
  const asset: number;
  export default asset;
}

declare module '*.otf' {
  const asset: number;
  export default asset;
}
