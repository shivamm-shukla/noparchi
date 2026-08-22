import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import type { DateRangeKey } from '../../src/types';

interface DateFilterProps {
  selected: DateRangeKey;
  onSelect: (range: DateRangeKey) => void;
}

const FILTER_OPTIONS: { id: DateRangeKey; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'all', label: 'All Time' },
];

export const DateFilter: React.FC<DateFilterProps> = ({ selected, onSelect }) => {
  return (
    <View className="my-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
      >
        {FILTER_OPTIONS.map((item) => {
          const isActive = selected === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => onSelect(item.id)}
              activeOpacity={0.7}
              className={`px-3.5 py-1.5 rounded-full border ${
                isActive
                  ? 'bg-brand-accent border-brand-accent'
                  : 'bg-brand-surface border-brand-border active:bg-brand-surface-raised'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  isActive ? 'text-brand-on-accent font-bold' : 'text-brand-text-muted'
                }`}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};
