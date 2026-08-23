import React from 'react';
import { View } from 'react-native';
import { Info, Quote } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/context/ThemeContext';
import { elevation } from '../../src/config/elevation';
import {
  MARKETING_IS_ILLUSTRATIVE,
  MARKETING_QUOTES,
  MARKETING_STATS,
} from '../../src/config/marketing';
import { Text } from '../ui/Text';
import { Section, SectionHead, Grid, useColumns } from './shared';

/**
 * Numbers and quotes - the part of a marketing page that only works once the
 * product has been used.
 *
 * None of it is real yet, and the notice above says so. That is not caution for
 * its own sake: a fabricated figure on a live page is a claim, and this app
 * exists because someone was tired of being lied to about a count. The notice
 * disappears on its own when MARKETING_IS_ILLUSTRATIVE goes false.
 */
export const Proof: React.FC = () => {
  const { t } = useTranslation();
  const { colors, resolved } = useTheme();
  const statColumns = useColumns(4);
  const quoteColumns = useColumns(3);

  return (
    <Section raised>
      {MARKETING_IS_ILLUSTRATIVE ? (
        <View className="mx-auto mb-12 w-full max-w-2xl flex-row items-start gap-2.5 rounded-card border border-brand-warning/40 bg-brand-warning/10 px-4 py-3">
          <Info size={15} color={colors['warning']} />
          <Text font="body-medium" className="flex-1 text-[13px] leading-6 text-brand-text-subtle">
            {t('landing.proof.notice')}
          </Text>
        </View>
      ) : null}

      <View className="mb-14">
        <Grid columns={statColumns} gap={18}>
          {MARKETING_STATS.map((stat) => (
            <View
              key={stat.labelKey}
              style={elevation('card', resolved)}
              className="items-center rounded-card border border-brand-border bg-brand-surface px-4 py-7"
            >
              <Text
                font="display-extrabold"
                className="mb-1.5 text-[30px] leading-none text-brand-text sm:text-[34px]"
              >
                {stat.value}
              </Text>
              <Text
                font="body-medium"
                className="text-center text-[12px] uppercase tracking-wider text-brand-text-muted"
              >
                {t(stat.labelKey)}
              </Text>
            </View>
          ))}
        </Grid>
      </View>

      <SectionHead title={t('landing.proof.title')} />

      <Grid columns={quoteColumns} gap={18}>
        {MARKETING_QUOTES.map((entry) => (
          <View
            key={entry.quoteKey}
            style={elevation('card', resolved)}
            className="h-full justify-between gap-5 rounded-card border border-brand-border bg-brand-surface p-6"
          >
            <View className="gap-4">
              <Quote size={18} color={colors['accent']} />
              <Text font="body" className="text-[14.5px] leading-7 text-brand-text-subtle">
                {t(entry.quoteKey)}
              </Text>
            </View>

            <View className="flex-row items-center gap-3 border-t border-brand-border pt-4">
              {/* An initial, not a stock portrait - there is no one to photograph. */}
              <View className="h-9 w-9 items-center justify-center rounded-control border border-brand-border bg-brand-surface-alt">
                <Text font="display-bold" className="text-sm text-brand-text-subtle">
                  {entry.initial}
                </Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text font="body-semibold" numberOfLines={1} className="text-[13px] text-brand-text">
                  {t(entry.roleKey)}
                </Text>
                <Text font="body" numberOfLines={1} className="text-xs text-brand-text-muted">
                  {t(entry.locationKey)}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </Grid>
    </Section>
  );
};
