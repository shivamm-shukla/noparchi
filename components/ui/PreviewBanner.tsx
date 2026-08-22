import React from 'react';
import { View, Text } from 'react-native';
import { Eye } from 'lucide-react-native';
import { isPreview } from '../../src/config/env';
import { useThemeColors } from '../../src/context/ThemeContext';

/**
 * Says, permanently and unmissably, that none of this is real.
 *
 * The inherited codebase served mock data silently whenever a request failed,
 * which is how it came to look finished while never touching a database. If
 * sample data is going to exist at all, the app has to admit it on screen for
 * as long as it is showing it.
 */
export const PreviewBanner: React.FC = () => {
  const colors = useThemeColors();
  if (!isPreview) return null;

  return (
    <View className="flex-row items-center justify-center gap-2 px-3 py-1.5 bg-brand-warning/15 border-b border-brand-warning/40">
      <Eye size={12} color={colors['warning']} />
      <Text className="text-[11px] font-bold text-brand-warning text-center">
        Preview — sample data. Nothing is saved.
      </Text>
    </View>
  );
};
