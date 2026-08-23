import React from 'react';
import { Stack } from 'expo-router';
import { useThemeColors } from '../../../src/context/ThemeContext';

export default function AuthLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors['bg'] },
      }}
    />
  );
}
