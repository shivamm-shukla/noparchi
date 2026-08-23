import React from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useThemeColors } from '../../src/context/ThemeContext';

interface PulseRingProps {
  /** How far the ring sits outside the thing it surrounds. */
  inset?: number;
  radius?: number;
  /** One full expand-and-fade, in ms. Matches the prototype's 2.4s. */
  duration?: number;
}

/**
 * The soft ring that expands and fades around a live QR.
 *
 * Ported from the landing page's `.pulse-ring` keyframes rather than
 * reinterpreted: 0.55 opacity at 0.94 scale, fading out by 70% of the cycle and
 * holding empty until it restarts. That pause is what makes it read as a pulse
 * rather than a spinner.
 *
 * Reanimated drives it on the UI thread, so it keeps its rhythm while the JS
 * thread is busy - which on the scanner screen it continuously is.
 */
export const PulseRing: React.FC<PulseRingProps> = ({
  inset = 14,
  radius = 26,
  duration = 2400,
}) => {
  const colors = useThemeColors();
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    return () => cancelAnimation(progress);
  }, [duration, progress]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    // 0 -> 0.7 expands and fades; 0.7 -> 1 is the held gap before the next ring.
    const eased = Math.min(t / 0.7, 1);
    return {
      opacity: t >= 0.7 ? 0 : 0.55 * (1 - eased),
      transform: [{ scale: 0.94 + 0.14 * eased }],
    };
  });

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: -inset, left: -inset, right: -inset, bottom: -inset }}
    >
      <Animated.View
        style={[
          {
            flex: 1,
            borderRadius: radius,
            borderWidth: 2,
            borderColor: colors['accent'],
          },
          style,
        ]}
      />
    </View>
  );
};
