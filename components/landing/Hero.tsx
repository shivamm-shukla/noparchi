import React from 'react';
import { View, useWindowDimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/context/ThemeContext';
import { elevation } from '../../src/config/elevation';
import { radii } from '../../src/config/radii';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { PulseRing } from '../ui/PulseRing';
import { CONTENT_MAX_WIDTH } from './shared';

/** Where the hero QR points. A real, openable page, not a decorative pattern. */
const DEMO_CHECKOUT_PATH = '/pay/preview-merchant';

export const Hero: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const narrow = width < 860;

  const jumpToHow = () => {
    if (Platform.OS !== 'web') return;
    document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <View className="w-full px-6 pb-14 pt-16 sm:px-8 sm:pt-24">
      <View style={{ maxWidth: CONTENT_MAX_WIDTH }} className="mx-auto w-full items-center">
        <View className="mb-7 rounded-full border border-brand-accent/30 bg-brand-accent/10 px-3.5 py-1.5">
          <Text font="body-semibold" className="text-[13px] text-brand-accent">
            {t('landing.hero.eyebrow')}
          </Text>
        </View>

        <Text
          font="display-bold"
          className="mb-5 max-w-3xl text-center text-[38px] leading-[1.08] text-brand-text sm:text-[60px]"
        >
          {t('landing.hero.titleA')}
          <Text font="display-bold" className="text-brand-accent">
            {t('landing.hero.titleAccent')}
          </Text>
          {t('landing.hero.titleB')}
        </Text>

        <Text
          font="body"
          className="mb-8 max-w-xl text-center text-[17px] leading-8 text-brand-text-subtle sm:text-[19px]"
        >
          {t('landing.hero.sub')}
        </Text>

        <View className={`mb-5 gap-3.5 ${narrow ? 'w-full max-w-xs' : 'flex-row'}`}>
          <Button
            title={t('landing.hero.ctaPrimary')}
            size="lg"
            variant="primary"
            fullWidth={narrow}
            onPress={() => router.push('/app/sign-up')}
          />
          <Button
            title={t('landing.hero.ctaSecondary')}
            size="lg"
            variant="outline"
            fullWidth={narrow}
            onPress={jumpToHow}
          />
        </View>

        <Text font="body" className="text-center text-[13px] text-brand-text-muted">
          {t('landing.hero.note')}
        </Text>

        <DeviceWindow />
      </View>
    </View>
  );
};

/**
 * The bounded "window" the prototype frames its hero in.
 *
 * The traffic-light dots are decorative and deliberately kept: they are what
 * make the panel read as a piece of software rather than another card. They are
 * fixed macOS colours, not theme roles, for the same reason.
 */
const DeviceWindow: React.FC = () => {
  const { colors, resolved } = useTheme();
  const { width } = useWindowDimensions();
  const stacked = width < 860;

  return (
    <View
      style={[{ maxWidth: 760, borderRadius: radii.panel }, elevation('hero', resolved)]}
      className="mt-14 w-full overflow-hidden border border-brand-border bg-brand-surface"
    >
      <View className="flex-row items-center gap-[7px] border-b border-brand-border px-[18px] py-3.5">
        <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: '#FF5F57' }} />
        <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: '#FEBC2E' }} />
        <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: '#28C840' }} />
      </View>

      <View className={`gap-8 p-7 sm:p-10 ${stacked ? '' : 'flex-row items-center'}`}>
        <View className="flex-1 items-center justify-center">
          <View
            style={{ borderRadius: 20 }}
            className="relative items-center justify-center border border-brand-border bg-brand-paper p-4"
          >
            <PulseRing />
            <QRCode
              value={DEMO_CHECKOUT_PATH}
              size={132}
              color={colors['on-paper']}
              backgroundColor={colors['paper']}
              ecl="H"
            />
            <View
              style={{ width: 42, height: 42, borderRadius: radii.control, borderWidth: 3 }}
              className="absolute items-center justify-center border-brand-paper bg-brand-on-paper"
            >
              <Text
                font="display-extrabold"
                style={{ fontSize: 15, color: colors['accent'] }}
              >
                NP
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-1 gap-[18px]">
          <FlowStep n="1" titleKey="landing.hero.step1Title" bodyKey="landing.hero.step1Body" />
          <FlowStep n="2" titleKey="landing.hero.step2Title" bodyKey="landing.hero.step2Body" />
          <FlowStep n="3" titleKey="landing.hero.step3Title" bodyKey="landing.hero.step3Body" />
        </View>
      </View>
    </View>
  );
};

const FlowStep: React.FC<{ n: string; titleKey: string; bodyKey: string }> = ({
  n,
  titleKey,
  bodyKey,
}) => {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-start gap-3">
      <View className="mt-px h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-brand-accent/10">
        <Text font="body-bold" className="text-xs text-brand-accent">
          {n}
        </Text>
      </View>
      <View className="flex-1">
        <Text font="display-semibold" className="mb-0.5 text-[15px] text-brand-text">
          {t(titleKey)}
        </Text>
        <Text font="body" className="text-[13.5px] leading-6 text-brand-text-subtle">
          {t(bodyKey)}
        </Text>
      </View>
    </View>
  );
};
