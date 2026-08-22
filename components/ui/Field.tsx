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
    <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
      {label}
    </Text>
    <View className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3">{children}</View>
    {hint ? <Text className="text-[11px] text-slate-500 mt-1.5 leading-4">{hint}</Text> : null}
  </View>
);
