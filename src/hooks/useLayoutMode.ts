import { useWindowDimensions } from 'react-native';

export type LayoutMode = 'compact' | 'expanded';

/**
 * The width at which navigation moves from a bottom bar to a sidebar.
 *
 * 900 rather than a phone/tablet guess: this is a width question, not a device
 * question. The web export is used on laptops, and forcing a phone-width bottom
 * bar onto a 1440px browser window is exactly what this avoids. A tablet in
 * landscape gets the sidebar for the same reason, and the same tablet in
 * portrait correctly does not.
 */
export const EXPANDED_BREAKPOINT = 900;

export function useLayoutMode(): LayoutMode {
  const { width } = useWindowDimensions();
  return width >= EXPANDED_BREAKPOINT ? 'expanded' : 'compact';
}

export function useIsExpanded(): boolean {
  return useLayoutMode() === 'expanded';
}
