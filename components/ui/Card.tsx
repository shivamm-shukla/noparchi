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
        return 'bg-brand-surface border border-brand-border shadow-lg shadow-black/40';
      case 'glass':
        // No backdrop-blur: it is a web-only filter that renders as a plain
        // translucent panel on Android and iOS, so the variant would look
        // different on the platforms the merchant actually uses.
        return 'bg-brand-surface/80 border border-brand-border/80';
      case 'emerald':
        return 'bg-brand-accent/30 border border-brand-accent/20';
      case 'default':
      default:
        return 'bg-brand-surface border border-brand-border/90';
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
