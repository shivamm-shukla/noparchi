import React from 'react';
import { View, Image } from 'react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { radii } from '../../src/config/radii';
import { Text } from './Text';
import { cn } from '../../src/utils/cn';

interface MerchantLogoProps {
  /** The business name. Used for the fallback and for the accessibility label. */
  name: string;
  /** From `merchant.branding.logoUrl`. Absent for a merchant who has not set one. */
  logoUrl?: string;
  size?: number;
  className?: string;
}

/** "Metro Hub Parking" -> "MH". At most two letters, or the QR badge gets noisy. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * The merchant's own mark, wherever a customer is looking at their business.
 *
 * A customer who scans a gate QR has no idea what NoParchi is - they scanned a
 * sign at a parking lot. The page should say whose parking lot it is, which a
 * generic sparkle never did.
 *
 * When no logo has been set the fallback is the business's initials rather than
 * an icon, matching the badge at the centre of that merchant's gate QR. Initials
 * are still theirs; a stock glyph belongs to nobody.
 */
export const MerchantLogo: React.FC<MerchantLogoProps> = ({
  name,
  logoUrl,
  size = 36,
  className,
}) => {
  const colors = useThemeColors();
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(logoUrl) && !failed;

  return (
    <View
      style={{ width: size, height: size, borderRadius: radii.control }}
      className={cn(
        'items-center justify-center overflow-hidden border',
        // A logo is artwork and needs a neutral ground to sit on; initials are
        // type and belong in the accent chip the rest of the app uses.
        showImage
          ? 'bg-brand-paper border-brand-border'
          : 'bg-brand-accent/10 border-brand-accent/30',
        className
      )}
    >
      {showImage ? (
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessibilityLabel={name}
          accessibilityRole="image"
          // A logo that 404s should quietly become the initials, not a broken
          // image icon on a stranger's checkout page.
          onError={() => setFailed(true)}
        />
      ) : (
        <Text
          font="display-extrabold"
          style={{ fontSize: size * 0.4, color: colors['accent'] }}
          accessibilityLabel={name}
        >
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
};
