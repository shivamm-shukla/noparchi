/**
 * The font assets, mapped to the face names src/config/typography.js uses.
 *
 * Kept apart from typography.js on purpose: that file is loaded by Node when
 * tailwind.config.js runs, and a `.ttf` require would throw there. This file is
 * only ever loaded by Metro, which knows how to bundle a font.
 *
 * Imported by file path rather than from each package's index, and that is not
 * a style choice. The barrels re-export every weight the family ships - 18 for
 * Inter alone, italics included - and Metro bundles a `require()` it can see
 * whether or not the binding is used. Going through them shipped 34 faces and
 * 8.5 MB; these eleven paths ship what the app actually sets.
 *
 * One economy: Devanagari extrabold reuses the 700 face. Noto ships an 800, but
 * at heading sizes the two are hard to tell apart and the extra face is ~350 kB.
 */
import Manrope_600SemiBold from '@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf';
import Manrope_700Bold from '@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf';
import Manrope_800ExtraBold from '@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf';
import Inter_400Regular from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
import Inter_500Medium from '@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf';
import Inter_600SemiBold from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf';
import Inter_700Bold from '@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf';
import NotoSansDevanagari_400Regular from '@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf';
import NotoSansDevanagari_500Medium from '@expo-google-fonts/noto-sans-devanagari/500Medium/NotoSansDevanagari_500Medium.ttf';
import NotoSansDevanagari_600SemiBold from '@expo-google-fonts/noto-sans-devanagari/600SemiBold/NotoSansDevanagari_600SemiBold.ttf';
import NotoSansDevanagari_700Bold from '@expo-google-fonts/noto-sans-devanagari/700Bold/NotoSansDevanagari_700Bold.ttf';

/** Passed straight to `useFonts()`. Keys must match `familyFor()`'s output. */
export const FONT_ASSETS = {
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
} as const;
