import React from 'react';
import { TouchableOpacity, ActivityIndicator, View } from 'react-native';
import { Text } from './Text';
import { useThemeColors } from '../../src/context/ThemeContext';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
  /** Defaults to `title`. Set it when the visible text is not the whole story. */
  accessibilityLabel?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  className = '',
  fullWidth = false,
  accessibilityLabel,
}) => {
  const colors = useThemeColors();
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-brand-accent active:bg-brand-accent-deep border-brand-accent/30';
      case 'secondary':
        return 'bg-brand-surface-raised active:bg-brand-surface-raised border-brand-border-strong';
      case 'outline':
        return 'bg-transparent border-brand-border-strong active:bg-brand-surface-raised/50';
      case 'danger':
        return 'bg-brand-danger active:bg-brand-danger border-brand-danger/30';
      case 'ghost':
        return 'bg-transparent active:bg-brand-surface-raised/30 border-transparent';
      default:
        return 'bg-brand-accent';
    }
  };

  const getTextStyles = () => {
    switch (variant) {
      case 'primary':
        return 'text-brand-on-accent font-bold';
      case 'secondary':
        return 'text-brand-text font-semibold';
      case 'outline':
        return 'text-brand-text font-semibold';
      case 'danger':
        return 'text-white font-bold';
      case 'ghost':
        return 'text-brand-text-subtle font-medium';
      default:
        return 'text-brand-on-accent font-bold';
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return 'py-2 px-3 rounded-lg text-xs';
      case 'lg':
        return 'py-3.5 px-6 rounded-xl text-base';
      case 'md':
      default:
        return 'py-2.5 px-4 rounded-xl text-sm';
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      // Without these a TouchableOpacity is an unlabelled div on web and an
      // unannounced view on native - the primary action of a screen reachable
      // only by sighted tap. `busy` matters because the label stays put while
      // the spinner replaces it.
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      className={`flex-row items-center justify-center border ${getVariantStyles()} ${getSizeStyles()} ${
        fullWidth ? 'w-full' : ''
      } ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors['on-accent'] : colors['accent']}
        />
      ) : (
        <View className="flex-row items-center justify-center gap-2">
          {icon && <View>{icon}</View>}
          <Text font="body-semibold" className={`${getTextStyles()} tracking-wide`}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
