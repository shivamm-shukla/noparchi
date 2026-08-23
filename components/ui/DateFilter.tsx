import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import type { DateRangeKey } from '../../src/types';

interface DateFilterProps {
  selected: DateRangeKey;
  onSelect: (range: DateRangeKey) => void;
}

/** Keys only. The labels are translated at render, not baked in here. */
const RANGES: DateRangeKey[] = ['today', 'yesterday', 'week', 'month', 'all'];

export const DateFilter: React.FC<DateFilterProps> = ({ selected, onSelect }) => {
  const { t } = useTranslation();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
      accessibilityRole="radiogroup"
    >
      {RANGES.map((range) => {
        const active = selected === range;
        return (
          <Pressable
            key={range}
            onPress={() => onSelect(range)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(`ledger.range.${range}`)}
            className={`rounded-full border px-3.5 py-1.5 ${
              active
                ? 'border-brand-accent bg-brand-accent'
                : 'border-brand-border bg-brand-surface active:bg-brand-surface-alt'
            }`}
          >
            <View>
              <Text
                font={active ? 'body-bold' : 'body-medium'}
                className={`text-xs ${active ? 'text-brand-on-accent' : 'text-brand-text-muted'}`}
              >
                {t(`ledger.range.${range}`)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};
