import React from 'react';
import { View, Text } from 'react-native';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'emerald';

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
  success: { container: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400' },
  emerald: { container: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400' },
  warning: { container: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400' },
  danger: { container: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-400' },
  info: { container: 'bg-sky-500/10 border-sky-500/30', text: 'text-sky-400' },
  neutral: { container: 'bg-slate-800 border-slate-700', text: 'text-slate-300' },
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
