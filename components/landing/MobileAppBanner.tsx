import React, { useState, useEffect } from 'react';
import { View, Pressable, Platform, useWindowDimensions, Linking } from 'react-native';
import { Download, X, Smartphone, Sparkles } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../src/context/ThemeContext';
import { elevation } from '../../src/config/elevation';
import { radii } from '../../src/config/radii';
import { env } from '../../src/config/env';
import { Text } from '../ui/Text';

/**
 * Indus Appstore SVG icon (PhonePe's Indian App Store).
 */
const IndusAppStoreIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <Defs>
      <LinearGradient id="indusGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <Stop stopColor="#6739B7" />
        <Stop offset="1" stopColor="#3F51B5" />
      </LinearGradient>
    </Defs>
    <Rect width={32} height={32} rx={8} fill="url(#indusGrad)" />
    {/* Stylized 'i' & diamond gateway mark */}
    <Path
      d="M16 6.5C14.067 6.5 12.5 8.067 12.5 10C12.5 11.933 14.067 13.5 16 13.5C17.933 13.5 19.5 11.933 19.5 10C19.5 8.067 17.933 6.5 16 6.5Z"
      fill="#FFFFFF"
    />
    <Path
      d="M13 16C13 15.1716 13.6716 14.5 14.5 14.5H17.5C18.3284 14.5 19 15.1716 19 16V24C19 24.8284 18.3284 25.5 17.5 25.5H14.5C13.6716 25.5 13 24.8284 13 24V16Z"
      fill="#FFFFFF"
    />
    <Path
      d="M10 24.5C10 24.5 12 26 16 26C20 26 22 24.5 22 24.5"
      stroke="#FFC107"
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);

/**
 * Mobile-only banner for downloading the NoParchi Android app.
 *
 * It is rendered ONLY when a user opens the website on a mobile device / phone viewport.
 * It provides two clear download options:
 * 1. Direct APK Download (from website/storage)
 * 2. Indus Appstore (India's official 0% fee Android app store)
 */
export const MobileAppBanner: React.FC = () => {
  const { t } = useTranslation();
  const { colors, resolved } = useTheme();
  const { width } = useWindowDimensions();
  const [dismissed, setDismissed] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setIsMobileDevice(true);
      return;
    }

    const checkMobile = () => {
      const isNarrow = width < 768;
      const hasMobileUserAgent =
        typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent);
      setIsMobileDevice(isNarrow || hasMobileUserAgent);
    };

    checkMobile();
  }, [width]);

  // Only show on phone screens and when not dismissed
  if (!isMobileDevice || dismissed) {
    return null;
  }

  const handleDirectDownload = () => {
    const url = env.apkDownloadUrl;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  const handleIndusDownload = () => {
    const url = env.indusStoreUrl;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <View className="w-full px-4 pt-3 pb-2">
      <View
        style={[
          { borderRadius: radii.card },
          elevation('card', resolved),
        ]}
        className="relative overflow-hidden border border-brand-accent/30 bg-brand-surface p-4 shadow-sm"
      >
        {/* Close Button */}
        <Pressable
          onPress={() => setDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel={t('landing.appDownload.dismiss')}
          className="absolute right-3 top-3 z-10 h-7 w-7 items-center justify-center rounded-full bg-brand-surface-alt active:opacity-70"
        >
          <X size={15} color={colors['text-muted']} />
        </Pressable>

        {/* Header with Eyebrow Badge */}
        <View className="mb-2 flex-row items-center gap-2">
          <View className="flex-row items-center gap-1.5 rounded-full border border-brand-accent/40 bg-brand-accent/15 px-2.5 py-0.5">
            <Sparkles size={11} color={colors['accent']} />
            <Text font="body-bold" className="text-[11px] uppercase tracking-wider text-brand-accent">
              {t('landing.appDownload.badge')}
            </Text>
          </View>
        </View>

        <Text font="display-bold" className="mb-1 text-[17px] leading-snug text-brand-text">
          {t('landing.appDownload.title')}
        </Text>

        <Text font="body" className="mb-3.5 text-[13px] leading-5 text-brand-text-subtle">
          {t('landing.appDownload.sub')}
        </Text>

        {/* Two Download Options */}
        <View className="gap-2.5">
          {/* Option 1: Direct APK Download */}
          <Pressable
            onPress={handleDirectDownload}
            accessibilityRole="link"
            accessibilityLabel={t('landing.appDownload.directApk')}
            className="flex-row items-center justify-between rounded-xl border border-brand-accent bg-brand-accent px-4 py-3 active:opacity-90"
          >
            <View className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand-on-accent/20">
                <Download size={19} color={colors['on-accent']} />
              </View>
              <View>
                <Text font="display-semibold" className="text-[14px] text-brand-on-accent">
                  {t('landing.appDownload.directApk')}
                </Text>
                <Text font="body" className="text-[11px] text-brand-on-accent/80">
                  {t('landing.appDownload.directApkHint')}
                </Text>
              </View>
            </View>
            <View className="rounded-md bg-brand-on-accent/20 px-2 py-0.5">
              <Text font="display-bold" className="text-[11px] text-brand-on-accent">
                .APK
              </Text>
            </View>
          </Pressable>

          {/* Option 2: Indus Appstore */}
          <Pressable
            onPress={handleIndusDownload}
            accessibilityRole="link"
            accessibilityLabel={t('landing.appDownload.indusStore')}
            className="flex-row items-center justify-between rounded-xl border border-brand-border bg-brand-surface-alt px-4 py-3 active:opacity-80"
          >
            <View className="flex-row items-center gap-3">
              <IndusAppStoreIcon size={34} />
              <View>
                <Text font="display-semibold" className="text-[14px] text-brand-text">
                  {t('landing.appDownload.indusStore')}
                </Text>
                <Text font="body" className="text-[11px] text-brand-text-muted">
                  {t('landing.appDownload.indusStoreHint')}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-1 rounded-md border border-brand-border bg-brand-surface px-2 py-1">
              <Smartphone size={12} color={colors['text-subtle']} />
              <Text font="body-medium" className="text-[11px] text-brand-text-subtle">
                Store
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
};
