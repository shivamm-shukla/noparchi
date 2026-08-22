import React from 'react';
import { View, Text } from 'react-native';
import { Card } from './Card';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: string;
  trendPositive?: boolean;
  icon: React.ReactNode;
  highlight?: boolean;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  trendPositive = true,
  icon,
  highlight = false,
}) => {
  return (
    <Card
      variant={highlight ? 'emerald' : 'default'}
      className="flex-1 min-w-[150px] sm:min-w-[200px]"
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-brand-text-muted text-xs font-semibold uppercase tracking-wider">
          {title}
        </Text>
        <View className="p-2 rounded-xl bg-brand-surface-raised/80 border border-brand-border-strong/50">
          {icon}
        </View>
      </View>

      <Text className="text-2xl sm:text-3xl font-extrabold text-brand-text mb-1">
        {value}
      </Text>

      {(subtitle || trend) && (
        <View className="flex-row items-center gap-1.5 mt-1">
          {trend && (
            <Text
              className={`text-xs font-bold ${
                trendPositive ? 'text-brand-accent' : 'text-brand-danger'
              }`}
            >
              {trendPositive ? '↑' : '↓'} {trend}
            </Text>
          )}
          {subtitle && (
            <Text className="text-brand-text-muted text-xs truncate">{subtitle}</Text>
          )}
        </View>
      )}
    </Card>
  );
};
