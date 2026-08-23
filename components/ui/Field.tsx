import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';

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
    <Text
      font="body-semibold"
      className="mb-2 text-xs uppercase tracking-wider text-brand-text-subtle"
    >
      {label}
    </Text>
    <View className="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">{children}</View>
    {hint ? <Text font="body" className="mt-1.5 text-[11px] leading-4 text-brand-text-faint">
        {hint}
      </Text> : null}
  </View>
);
