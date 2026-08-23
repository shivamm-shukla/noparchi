import React from 'react';
import { View } from 'react-native';
import {
  ShieldCheck,
  IndianRupee,
  Users,
  MessageSquare,
  WifiOff,
  BarChart3,
  Car,
  Tent,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/context/ThemeContext';
import { elevation } from '../../src/config/elevation';
import { Text } from '../ui/Text';
import { Section, SectionHead, Grid, useColumns } from './shared';

const FEATURES: { icon: LucideIcon; titleKey: string; bodyKey: string }[] = [
  { icon: ShieldCheck, titleKey: 'landing.features.f1Title', bodyKey: 'landing.features.f1Body' },
  { icon: IndianRupee, titleKey: 'landing.features.f2Title', bodyKey: 'landing.features.f2Body' },
  { icon: Users, titleKey: 'landing.features.f3Title', bodyKey: 'landing.features.f3Body' },
  { icon: MessageSquare, titleKey: 'landing.features.f4Title', bodyKey: 'landing.features.f4Body' },
  { icon: WifiOff, titleKey: 'landing.features.f5Title', bodyKey: 'landing.features.f5Body' },
  { icon: BarChart3, titleKey: 'landing.features.f6Title', bodyKey: 'landing.features.f6Body' },
];

export const Features: React.FC = () => {
  const { t } = useTranslation();
  const { colors, resolved } = useTheme();
  const columns = useColumns(3);

  return (
    <Section nativeID="features">
      <SectionHead
        tag={t('landing.features.tag')}
        title={t('landing.features.title')}
        sub={t('landing.features.sub')}
      />
      <Grid columns={columns} gap={18}>
        {FEATURES.map(({ icon: Icon, titleKey, bodyKey }) => (
          <View
            key={titleKey}
            style={elevation('card', resolved)}
            className="h-full rounded-card border border-brand-border bg-brand-surface px-6 py-7"
          >
            {/*
              The tinted chip is the only accent on the card. The prototype puts
              one here and nowhere else in the tile, which is what keeps a wall
              of six from turning green.
            */}
            <View className="mb-5 h-11 w-11 items-center justify-center rounded-xl bg-brand-accent/10">
              <Icon size={22} color={colors['accent']} />
            </View>
            <Text font="display-semibold" className="mb-2 text-[16.5px] text-brand-text">
              {t(titleKey)}
            </Text>
            <Text font="body" className="text-sm leading-6 text-brand-text-subtle">
              {t(bodyKey)}
            </Text>
          </View>
        ))}
      </Grid>
    </Section>
  );
};

const STEPS = [
  { titleKey: 'landing.how.s1Title', bodyKey: 'landing.how.s1Body' },
  { titleKey: 'landing.how.s2Title', bodyKey: 'landing.how.s2Body' },
  { titleKey: 'landing.how.s3Title', bodyKey: 'landing.how.s3Body' },
  { titleKey: 'landing.how.s4Title', bodyKey: 'landing.how.s4Body' },
];

export const HowItWorks: React.FC = () => {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const columns = useColumns(4);

  return (
    <Section raised nativeID="how">
      <SectionHead tag={t('landing.how.tag')} title={t('landing.how.title')} />
      <Grid columns={columns} gap={24}>
        {STEPS.map((step, index) => (
          <View key={step.titleKey} className="items-center px-3">
            <View
              style={[{ width: 54, height: 54, borderRadius: 27 }, elevation('card', resolved)]}
              className="mb-5 items-center justify-center border border-brand-border bg-brand-surface"
            >
              <Text font="display-bold" className="text-[17px] text-brand-accent">
                {index + 1}
              </Text>
            </View>
            <Text
              font="display-semibold"
              className="mb-2 text-center text-[15.5px] text-brand-text"
            >
              {t(step.titleKey)}
            </Text>
            <Text font="body" className="text-center text-[13.5px] leading-6 text-brand-text-subtle">
              {t(step.bodyKey)}
            </Text>
          </View>
        ))}
      </Grid>
    </Section>
  );
};

const USE_CASES: { icon: LucideIcon; titleKey: string; bodyKey: string }[] = [
  { icon: Car, titleKey: 'landing.useCases.u1Title', bodyKey: 'landing.useCases.u1Body' },
  { icon: Tent, titleKey: 'landing.useCases.u2Title', bodyKey: 'landing.useCases.u2Body' },
  {
    icon: UtensilsCrossed,
    titleKey: 'landing.useCases.u3Title',
    bodyKey: 'landing.useCases.u3Body',
  },
];

export const UseCases: React.FC = () => {
  const { t } = useTranslation();
  const { colors, resolved } = useTheme();
  const columns = useColumns(3);

  return (
    <Section nativeID="usecases">
      <SectionHead tag={t('landing.useCases.tag')} title={t('landing.useCases.title')} />
      <Grid columns={columns} gap={18}>
        {USE_CASES.map(({ icon: Icon, titleKey, bodyKey }) => (
          <View
            key={titleKey}
            style={elevation('card', resolved)}
            className="h-full overflow-hidden rounded-card border border-brand-border bg-brand-surface"
          >
            <View className="h-[130px] items-center justify-center border-b border-brand-border bg-brand-surface-alt">
              <Icon size={44} color={colors['text-subtle']} strokeWidth={1.6} />
            </View>
            <View className="px-6 pb-7 pt-5">
              <Text font="display-semibold" className="mb-1.5 text-[15.5px] text-brand-text">
                {t(titleKey)}
              </Text>
              <Text font="body" className="text-[13.5px] leading-6 text-brand-text-subtle">
                {t(bodyKey)}
              </Text>
            </View>
          </View>
        ))}
      </Grid>
    </Section>
  );
};
