import React from 'react';
import { View, Text, Image } from 'react-native';
import { cn } from '../../src/utils/cn';

/**
 * The NoParchi mark: a QR code with a parchi struck through it.
 *
 * The artwork is drawn on slate-50, so it sits on a `brand-paper` tile rather
 * than straight on the screen - the same reason a QR renders on paper in both
 * themes. Dropping it onto `brand-bg` would show a pale square floating on the
 * dark ground.
 *
 * The wordmark beside it is text rather than the banner PNG: it takes the
 * theme's own colours, stays sharp at any size, and is readable to a screen
 * reader. `assets/noparchi-website.png` is the same lockup for places that
 * cannot render the app - the README, and anywhere else outside the bundle.
 */
const MARK = require('../../assets/noparchi-app-icon.png');

interface LogoProps {
  /** Edge of the square mark, in px. */
  size?: number;
  /** Show "NoParchi" beside the mark. */
  wordmark?: boolean;
  /** Show "Scan. Pay. Enter." under the wordmark. Implies `wordmark`. */
  tagline?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = 32,
  wordmark = false,
  tagline = false,
  className,
}) => {
  const showWordmark = wordmark || tagline;

  return (
    <View className={cn('flex-row items-center gap-2.5', className)}>
      <View
        style={{ width: size, height: size, borderRadius: size * 0.26 }}
        className="bg-brand-paper overflow-hidden"
      >
        <Image
          source={MARK}
          style={{ width: size, height: size }}
          resizeMode="contain"
          // The mark carries the name already; announcing it twice beside the
          // wordmark is noise.
          accessibilityLabel={showWordmark ? undefined : 'NoParchi'}
          accessibilityRole="image"
        />
      </View>

      {showWordmark ? (
        <View>
          <Text
            style={{ fontSize: size * 0.58, lineHeight: size * 0.72 }}
            className="font-extrabold text-brand-text"
          >
            No<Text className="text-brand-accent">Parchi</Text>
          </Text>
          {tagline ? (
            <Text
              style={{ fontSize: size * 0.3 }}
              className="text-brand-text-muted font-medium"
            >
              Scan. Pay. Enter.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};
