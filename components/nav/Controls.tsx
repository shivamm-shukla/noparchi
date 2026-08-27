import React from 'react';
import { View, Pressable } from 'react-native';
import { Sun, Moon, MonitorSmartphone, Languages } from 'lucide-react-native';
import { useTheme, type ThemePreference } from '../../src/context/ThemeContext';
import { useLanguage, type LanguagePreference } from '../../src/context/LanguageContext';
import { useTranslation } from 'react-i18next';
import { Text } from '../ui/Text';

type Variant = 'icon' | 'row';

interface Option<T> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/**
 * A small segmented picker.
 *
 * Kept here rather than in components/ui because both controls that use it are
 * navigation chrome; if a screen ever needs one, that is the moment to promote
 * it rather than now.
 */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row rounded-control border border-brand-border bg-brand-surface p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            className={`flex-1 items-center justify-center rounded-[7px] px-1.5 py-1.5 ${
              selected ? 'bg-brand-surface-raised' : ''
            }`}
          >
            <Text
              font={selected ? 'body-semibold' : 'body-medium'}
              numberOfLines={1}
              className={`text-[11px] ${selected ? 'text-brand-text' : 'text-brand-text-muted'}`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ControlRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2 px-1">
        {icon}
        <Text font="body-medium" className="text-[11px] uppercase tracking-wider text-brand-text-muted">
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function ThemeControl({ variant = 'icon' }: { variant?: Variant }) {
  const { preference, resolved, colors, setPreference } = useTheme();
  const { t } = useTranslation();

  const options: Option<ThemePreference>[] = [
    { value: 'system', label: t('appearance.themeSystem') },
    { value: 'light', label: t('appearance.themeLight') },
    { value: 'dark', label: t('appearance.themeDark') },
  ];

  if (variant === 'row') {
    return (
      <ControlRow
        icon={<MonitorSmartphone size={13} color={colors['text-muted']} />}
        label={t('appearance.theme')}
      >
        <Segmented
          options={options}
          value={preference}
          onChange={setPreference}
          label={t('appearance.theme')}
        />
      </ControlRow>
    );
  }

  // Compact: one button that flips between the two visible states. Holding
  // 'system' as a third stop here would make the button's next state
  // unguessable, so the explicit three-way choice lives in Settings and in the
  // sidebar row above.
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(resolved === 'dark' ? 'appearance.themeLight' : 'appearance.themeDark')}
      onPress={() => setPreference(next)}
      className="h-9 w-9 items-center justify-center rounded-control border border-brand-border bg-brand-surface active:bg-brand-surface-raised"
    >
      {resolved === 'dark' ? (
        <Sun size={16} color={colors['text-subtle']} />
      ) : (
        <Moon size={16} color={colors['text-subtle']} />
      )}
    </Pressable>
  );
}

export function LanguageControl({ variant = 'icon' }: { variant?: Variant }) {
  const { preference, resolved, setPreference } = useLanguage();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const options: Option<LanguagePreference>[] = [
    { value: 'system', label: t('appearance.languageSystem') },
    { value: 'en', label: t('appearance.languageEn') },
    { value: 'hi', label: t('appearance.languageHi') },
  ];

  if (variant === 'row') {
    return (
      <ControlRow
        icon={<Languages size={13} color={colors['text-muted']} />}
        label={t('appearance.language')}
      >
        <Segmented
          options={options}
          value={preference}
          onChange={setPreference}
          label={t('appearance.language')}
        />
      </ControlRow>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('appearance.language')}
      onPress={() => setPreference(resolved === 'en' ? 'hi' : 'en')}
      className="h-9 min-w-[44px] flex-row items-center justify-center gap-1 rounded-control border border-brand-border bg-brand-surface px-2.5 active:bg-brand-surface-raised"
    >
      <Text font="body-semibold" className="text-[12px] text-brand-text-subtle">
        {resolved === 'en' ? 'EN' : 'हिं'}
      </Text>
    </Pressable>
  );
}
