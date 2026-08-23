import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Text } from '../ui/Text';
import { cn } from '../../src/utils/cn';

/** The prototype's content column: 1120px, with 32px gutters. */
export const CONTENT_MAX_WIDTH = 1120;

/**
 * How many columns a grid gets at this width.
 *
 * Yoga implements neither CSS grid nor `grid-template-columns`, so the column
 * count is a number here rather than a class. Deciding it in JS also means the
 * same code lays out correctly on native, where a `lg:` prefix would resolve
 * against nothing.
 */
export function useColumns(max: number): number {
  const { width } = useWindowDimensions();
  if (width < 700) return 1;
  if (width < 1000) return Math.min(2, max);
  return max;
}

/** A page section: full-bleed background, content held to the column width. */
export const Section: React.FC<{
  children: React.ReactNode;
  /** Recessed band, for alternating sections. */
  raised?: boolean;
  className?: string;
  nativeID?: string;
}> = ({ children, raised = false, className, nativeID }) => (
  <View
    nativeID={nativeID}
    className={cn(
      'w-full px-6 py-16 sm:px-8 sm:py-24',
      raised && 'border-y border-brand-border bg-brand-surface-alt',
      className
    )}
  >
    <View style={{ maxWidth: CONTENT_MAX_WIDTH }} className="mx-auto w-full">
      {children}
    </View>
  </View>
);

/** Uppercase accent tag, headline, and a line of supporting copy. */
export const SectionHead: React.FC<{ tag?: string; title: string; sub?: string }> = ({
  tag,
  title,
  sub,
}) => (
  <View className="mx-auto mb-12 w-full max-w-2xl items-center sm:mb-14">
    {tag ? (
      <Text
        font="body-bold"
        className="mb-3.5 text-center text-[13px] uppercase tracking-[0.08em] text-brand-accent"
      >
        {tag}
      </Text>
    ) : null}
    <Text
      font="display-bold"
      className="mb-3.5 text-center text-[28px] leading-tight text-brand-text sm:text-[38px]"
    >
      {title}
    </Text>
    {sub ? (
      <Text font="body" className="text-center text-base leading-7 text-brand-text-subtle">
        {sub}
      </Text>
    ) : null}
  </View>
);

/**
 * Lays children out in rows of `columns`.
 *
 * A flex-wrap row with `flex-1` children would stretch a lone item on the last
 * row to full width; chunking into explicit rows and padding the short one with
 * invisible spacers keeps every card the same size.
 */
export const Grid: React.FC<{ columns: number; gap?: number; children: React.ReactNode }> = ({
  columns,
  gap = 18,
  children,
}) => {
  const items = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));

  return (
    <View style={{ gap }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ gap, flexDirection: 'row' }}>
          {row.map((child, i) => (
            <View key={i} style={{ flex: 1 }}>
              {child}
            </View>
          ))}
          {Array.from({ length: columns - row.length }).map((_, i) => (
            <View key={`spacer-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
};
