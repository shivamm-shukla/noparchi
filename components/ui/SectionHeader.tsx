import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { cn } from '../../src/utils/cn';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Small leading glyph. Optional, and usually better left out. */
  icon?: React.ReactNode;
  /** A link or button on the right - "View all", a filter. */
  action?: React.ReactNode;
  className?: string;
}

/** The title bar of a card, with an optional action opposite it. */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon,
  action,
  className,
}) => (
  <View className={cn('flex-row items-center justify-between gap-3', className)}>
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      {icon}
      <View className="min-w-0 flex-1">
        <Text font="display-bold" numberOfLines={1} className="text-[15px] text-brand-text">
          {title}
        </Text>
        {subtitle ? (
          <Text font="body" numberOfLines={1} className="text-xs text-brand-text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
    {action}
  </View>
);
