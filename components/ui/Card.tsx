import React from 'react';
import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'glass' | 'emerald';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'default',
  ...props
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'elevated':
        return 'bg-slate-900 border border-slate-800 shadow-lg shadow-black/40';
      case 'glass':
        return 'bg-slate-900/80 border border-slate-800/80 backdrop-blur-md';
      case 'emerald':
        return 'bg-emerald-950/30 border border-emerald-500/20';
      case 'default':
      default:
        return 'bg-slate-900 border border-slate-800/90';
    }
  };

  return (
    <View
      className={`rounded-2xl p-4 sm:p-5 ${getVariantStyles()} ${className}`}
      {...props}
    >
      {children}
    </View>
  );
};
