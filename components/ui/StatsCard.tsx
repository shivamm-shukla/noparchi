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
        <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
          {title}
        </Text>
        <View className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/50">
          {icon}
        </View>
      </View>

      <Text className="text-2xl sm:text-3xl font-extrabold text-slate-100 mb-1">
        {value}
      </Text>

      {(subtitle || trend) && (
        <View className="flex-row items-center gap-1.5 mt-1">
          {trend && (
            <Text
              className={`text-xs font-bold ${
                trendPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {trendPositive ? '↑' : '↓'} {trend}
            </Text>
          )}
          {subtitle && (
            <Text className="text-slate-400 text-xs truncate">{subtitle}</Text>
          )}
        </View>
      )}
    </Card>
  );
};
