import React from 'react';
import { View, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Logo } from '../ui/Logo';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { CONTENT_MAX_WIDTH } from './shared';

/**
 * The last ask before the footer.
 *
 * The band inverts - dark panel in light mode - which is the one place on the
 * page a whole surface is allowed to carry weight. The prototype does the same,
 * and it works because nothing else on the page does.
 */
export const CtaBand: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View className="w-full px-6 py-16 sm:px-8 sm:py-24">
      <View
        style={{ maxWidth: CONTENT_MAX_WIDTH, borderRadius: 28 }}
        className="mx-auto w-full items-center overflow-hidden border border-brand-border bg-brand-text px-8 py-14 sm:py-[70px]"
      >
        <Text
          font="display-bold"
          className="mb-3.5 text-center text-[26px] leading-tight text-brand-bg sm:text-[34px]"
        >
          {t('landing.cta.title')}
        </Text>
        <Text
          font="body"
          className="mb-8 max-w-lg text-center text-base leading-7 text-brand-bg/70"
        >
          {t('landing.cta.sub')}
        </Text>
        <Button
          title={t('landing.cta.button')}
          size="lg"
          variant="primary"
          onPress={() => router.push('/app/sign-up')}
        />
      </View>
    </View>
  );
};

export const SiteFooter: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const stacked = width < 860;

  const jump = (id: string) => () => {
    if (Platform.OS !== 'web') return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <View className="w-full border-t border-brand-border px-6 pb-9 pt-12 sm:px-8">
      <View style={{ maxWidth: CONTENT_MAX_WIDTH }} className="mx-auto w-full">
        <View className={`gap-8 ${stacked ? '' : 'flex-row justify-between'}`}>
          <View className="max-w-[280px] gap-2.5">
            <Logo size={34} wordmark />
            <Text font="body" className="text-[13.5px] leading-6 text-brand-text-muted">
              {t('landing.footer.blurb')}
            </Text>
          </View>

          <View className="flex-row gap-14">
            <FooterColumn
              title={t('landing.footer.product')}
              links={[
                { label: t('landing.nav.features'), onPress: jump('features') },
                { label: t('landing.nav.how'), onPress: jump('how') },
                { label: t('landing.nav.useCases'), onPress: jump('usecases') },
              ]}
            />
            <FooterColumn
              title={t('landing.footer.company')}
              links={[
                { label: t('landing.nav.signIn'), onPress: () => router.push('/app') },
                { label: t('landing.nav.getStarted'), onPress: () => router.push('/app/sign-up') },
              ]}
            />
          </View>
        </View>

        <View
          className={`mt-10 gap-2 border-t border-brand-border pt-6 ${
            stacked ? '' : 'flex-row justify-between'
          }`}
        >
          <Text font="body" className="text-[12.5px] text-brand-text-muted">
            {t('landing.footer.rights')}
          </Text>
          <Text font="body" className="text-[12.5px] text-brand-text-muted">
            {t('landing.footer.made')}
          </Text>
        </View>
      </View>
    </View>
  );
};

const FooterColumn: React.FC<{
  title: string;
  links: { label: string; onPress: () => void }[];
}> = ({ title, links }) => (
  <View className="gap-3.5">
    <Text
      font="body-bold"
      className="text-[12.5px] uppercase tracking-wider text-brand-text-muted"
    >
      {title}
    </Text>
    <View className="gap-2.5">
      {links.map((link) => (
        <Pressable
          key={link.label}
          onPress={link.onPress}
          accessibilityRole="link"
          accessibilityLabel={link.label}
        >
          <Text font="body" className="text-sm text-brand-text-subtle">
            {link.label}
          </Text>
        </Pressable>
      ))}
    </View>
  </View>
);
