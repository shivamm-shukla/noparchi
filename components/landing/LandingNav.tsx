import React from 'react';
import { View, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Logo } from '../ui/Logo';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { ThemeControl, LanguageControl } from '../nav/Controls';
import { CONTENT_MAX_WIDTH } from './shared';

/**
 * The marketing site's top bar.
 *
 * Sticky and translucent on web, which is where a marketing page is read. It
 * uses `position: sticky` directly rather than expo-blur: BlurView is a native
 * view that cannot be made sticky, and a marketing header that detaches on
 * scroll is worse than one that does not blur.
 */
export const LandingNav: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const showLinks = width >= 860;

  const stickyStyle =
    Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'saturate(180%) blur(20px)',
        } as unknown as Record<string, unknown>)
      : undefined;

  return (
    <View style={stickyStyle} className="w-full border-b border-brand-border bg-brand-bg/80">
      <View
        style={{ maxWidth: CONTENT_MAX_WIDTH }}
        className="mx-auto w-full flex-row items-center justify-between gap-4 px-6 py-3 sm:px-8"
      >
        <Pressable
          onPress={() => router.push('/')}
          accessibilityRole="link"
          accessibilityLabel="NoParchi"
        >
          <Logo size={34} wordmark />
        </Pressable>

        {showLinks ? (
          <View className="flex-row items-center gap-7">
            <NavLink label={t('landing.nav.features')} target="features" />
            <NavLink label={t('landing.nav.how')} target="how" />
            <NavLink label={t('landing.nav.useCases')} target="usecases" />
          </View>
        ) : null}

        <View className="flex-row items-center gap-2">
          <LanguageControl />
          <ThemeControl />
          <Button
            title={showLinks ? t('landing.nav.getStarted') : t('landing.nav.signIn')}
            size="sm"
            variant="secondary"
            onPress={() => router.push('/app')}
          />
        </View>
      </View>
    </View>
  );
};

/**
 * An in-page jump.
 *
 * Anchors only exist on web; on native this is inert rather than wrong, because
 * the whole page is one scroll view and there is nowhere else to go.
 */
const NavLink: React.FC<{ label: string; target: string }> = ({ label, target }) => {
  const onPress = () => {
    if (Platform.OS !== 'web') return;
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label}>
      <Text font="body-medium" className="text-sm text-brand-text-subtle">
        {label}
      </Text>
    </Pressable>
  );
};
