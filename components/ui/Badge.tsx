import React from 'react';
import { View, Text } from 'react-native';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

/**
 * Container and text classes are held separately rather than sliced out of one
 * string. The previous version did `getColors().split(' ').slice(0, 2)`, which
 * silently depended on every variant listing exactly two container classes
 * before the text class.
 */
const VARIANTS: Record<BadgeVariant, { container: string; text: string }> = {
  success: { container: 'bg-brand-accent/10 border-brand-accent/30', text: 'text-brand-accent' },
  warning: { container: 'bg-brand-warning/10 border-brand-warning/30', text: 'text-brand-warning' },
  danger: { container: 'bg-brand-danger/10 border-brand-danger/30', text: 'text-brand-danger' },
  info: { container: 'bg-brand-info/10 border-brand-info/30', text: 'text-brand-info' },
  neutral: { container: 'bg-brand-surface-raised border-brand-border-strong', text: 'text-brand-text-subtle' },
};

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'neutral', size = 'md' }) => {
  const styles = VARIANTS[variant];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1';

  return (
    <View
      className={`flex-row items-center justify-center rounded-full border ${styles.container} ${sizeClasses}`}
    >
      <Text className={`text-xs font-semibold tracking-wide ${styles.text}`}>{label}</Text>
    </View>
  );
};
