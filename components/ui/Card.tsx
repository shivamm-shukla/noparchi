import React from 'react';
import { View, type ViewProps } from 'react-native';
import { useTheme } from '../../src/context/ThemeContext';
import { elevation } from '../../src/config/elevation';
import { cn } from '../../src/utils/cn';

export type CardVariant = 'default' | 'hero' | 'flat';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
  variant?: CardVariant;
}

/**
 * A surface that floats off the ground.
 *
 * The lift comes from a shadow rather than a heavy border - one hairline plus a
 * wide, soft shadow, per the landing page. That is also why there is no longer
 * an `emerald` variant: a whole card tinted with the accent was the single
 * biggest reason the old app read as "everything is green". The accent marks
 * one thing per view, not the container it sits in.
 *
 * `flat` exists for a card nested inside another surface, where a second shadow
 * would just look like a rendering artefact.
 */
export const Card: React.FC<CardProps> = ({
  children,
  className,
  variant = 'default',
  style,
  ...props
}) => {
  const { resolved } = useTheme();

  return (
    <View
      style={[variant === 'flat' ? undefined : elevation(variant === 'hero' ? 'hero' : 'card', resolved), style]}
      className={cn(
        'rounded-card border border-brand-border bg-brand-surface p-4 sm:p-5',
        className
      )}
      {...props}
    >
      {children}
    </View>
  );
};
