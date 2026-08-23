import React from 'react';
import { View, Pressable } from 'react-native';
import { cn } from '../../src/utils/cn';

interface RowProps {
  children: React.ReactNode;
  onPress?: () => void;
  /** Suppressed on the last row, so a list does not end in a stray line. */
  divider?: boolean;
  accessibilityLabel?: string;
  className?: string;
}

/**
 * One line in a list.
 *
 * Separated by a hairline rather than wrapped in its own bordered, tinted box.
 * The old rows each carried a background and a border inside a card that
 * already had both, so a list of eight read as eight boxes in a box.
 */
export const Row: React.FC<RowProps> = ({
  children,
  onPress,
  divider = true,
  accessibilityLabel,
  className,
}) => {
  const content = (
    <View
      className={cn(
        'flex-row items-center gap-3 py-3',
        divider && 'border-b border-brand-border',
        className
      )}
    >
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="active:opacity-60"
    >
      {content}
    </Pressable>
  );
};
