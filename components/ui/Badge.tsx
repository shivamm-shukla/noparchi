import React from 'react';
import { View, Text } from 'react-native';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'emerald';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'neutral', size = 'md' }) => {
  const getColors = () => {
    switch (variant) {
      case 'success':
      case 'emerald':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
      case 'danger':
        return 'bg-rose-500/10 border-rose-500/30 text-rose-400';
      case 'info':
        return 'bg-sky-500/10 border-sky-500/30 text-sky-400';
      case 'neutral':
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <View
      className={`flex-row items-center justify-center rounded-full border ${getColors().split(' ').slice(0, 2).join(' ')} ${sizeClasses}`}
    >
      <Text className={`font-semibold tracking-wide ${getColors().split(' ').slice(2).join(' ')}`}>
        {label}
      </Text>
    </View>
  );
};
