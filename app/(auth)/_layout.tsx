import React from 'react';
import { Stack } from 'expo-router';
import theme from '../../src/config/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.semantic.bg },
      }}
    />
  );
}
