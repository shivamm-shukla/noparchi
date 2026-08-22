import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import theme from '../../src/config/theme';

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
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-emerald-500 active:bg-emerald-600 border-emerald-400/30';
      case 'secondary':
        return 'bg-slate-800 active:bg-slate-700 border-slate-700';
      case 'outline':
        return 'bg-transparent border-slate-700 active:bg-slate-800/50';
      case 'danger':
        return 'bg-rose-600 active:bg-rose-700 border-rose-500/30';
      case 'ghost':
        return 'bg-transparent active:bg-slate-800/30 border-transparent';
      default:
        return 'bg-emerald-500';
    }
  };

  const getTextStyles = () => {
    switch (variant) {
      case 'primary':
        return 'text-slate-950 font-bold';
      case 'secondary':
        return 'text-slate-100 font-semibold';
      case 'outline':
        return 'text-slate-200 font-semibold';
      case 'danger':
        return 'text-white font-bold';
      case 'ghost':
        return 'text-slate-300 font-medium';
      default:
        return 'text-slate-950 font-bold';
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
      className={`flex-row items-center justify-center border ${getVariantStyles()} ${getSizeStyles()} ${
        fullWidth ? 'w-full' : ''
      } ${disabled ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? theme.semantic.onAccent : theme.semantic.accent}
        />
      ) : (
        <View className="flex-row items-center justify-center gap-2">
          {icon && <View>{icon}</View>}
          <Text className={`${getTextStyles()} tracking-wide`}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
