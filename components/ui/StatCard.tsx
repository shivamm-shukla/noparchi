import React from 'react';
import { View } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Card } from './Card';
import { Text } from './Text';
import { cn } from '../../src/utils/cn';

interface StatCardProps {
  /** The quiet part. Sits above the figure, not beside it. */
  label: string;
  value: string | number;
  /** One line under the figure - what it is measured against. */
  detail?: string;
  /** Signed percentage. Renders an arrow and colours itself. */
  deltaPercent?: number | null;
  deltaLabel?: string;
  className?: string;
}

/**
 * One number, said once.
 *
 * Label above in muted small caps, figure below in the display face, detail
 * under that. No icon: a row of four cards each with its own coloured glyph is
 * four competing focal points, and none of them told the reader anything the
 * label did not.
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  detail,
  deltaPercent,
  deltaLabel,
  className,
}) => {
  const colors = useThemeColors();
  const hasDelta = deltaPercent !== null && deltaPercent !== undefined;
  const up = (deltaPercent ?? 0) >= 0;

  return (
    <Card className={cn('min-w-[150px] flex-1 justify-between gap-2', className)}>
      <Text
        font="body-medium"
        numberOfLines={1}
        className="text-[11px] uppercase tracking-wider text-brand-text-muted"
      >
        {label}
      </Text>

      <Text font="display-extrabold" numberOfLines={1} className="text-2xl text-brand-text sm:text-[28px]">
        {value}
      </Text>

      {hasDelta || detail ? (
        <View className="flex-row items-center gap-1.5">
          {hasDelta ? (
            <View className="flex-row items-center gap-1">
              {up ? (
                <TrendingUp size={12} color={colors['accent']} />
              ) : (
                <TrendingDown size={12} color={colors['danger']} />
              )}
              <Text
                font="body-semibold"
                className={cn('text-[11px]', up ? 'text-brand-accent' : 'text-brand-danger')}
              >
                {Math.abs(deltaPercent ?? 0)}%
              </Text>
            </View>
          ) : null}
          {detail || deltaLabel ? (
            <Text font="body" numberOfLines={1} className="flex-1 text-[11px] text-brand-text-muted">
              {hasDelta ? deltaLabel : detail}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
};
