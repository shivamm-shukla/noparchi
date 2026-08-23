import React from 'react';
import { View } from 'react-native';
import { Eye } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { isPreview } from '../../src/config/env';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Text } from './Text';

/**
 * Says, permanently and unmissably, that none of this is real.
 *
 * The inherited codebase served mock data silently whenever a request failed,
 * which is how it came to look finished while never touching a database. If
 * sample data is going to exist at all, the app has to admit it on screen for
 * as long as it is showing it - and in the language the person is reading.
 */
export const PreviewBanner: React.FC = () => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  if (!isPreview) return null;

  return (
    <View className="flex-row items-center justify-center gap-2 border-b border-brand-warning/40 bg-brand-warning/15 px-3 py-1.5">
      <Eye size={12} color={colors['warning']} />
      <Text font="body-semibold" className="text-center text-[11px] text-brand-warning">
        {t('preview.banner')}
      </Text>
    </View>
  );
};
