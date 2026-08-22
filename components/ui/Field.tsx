import React from 'react';
import { View, Text } from 'react-native';

/**
 * Label plus bordered input shell. Extracted so the three auth forms and the
 * settings form share one definition of what a field looks like.
 */
export const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <View className="mb-4">
    <Text className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2">
      {label}
    </Text>
    <View className="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">{children}</View>
    {hint ? <Text className="text-[11px] text-brand-text-faint mt-1.5 leading-4">{hint}</Text> : null}
  </View>
);
