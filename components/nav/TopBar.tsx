import React from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, UserCircle2, LogOut } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { useIsExpanded } from '../../src/hooks/useLayoutMode';
import { Text } from '../ui/Text';
import { Logo } from '../ui/Logo';
import { ThemeControl, LanguageControl } from './Controls';

interface TopBarProps {
  title?: string;
  subtitle?: string;
  /** Screen-specific control, e.g. a date range picker. */
  rightAction?: React.ReactNode;
}

/**
 * The bar above every merchant screen.
 *
 * It carries the brand and the appearance controls only when the sidebar is
 * not there to carry them - on a wide layout both live in the sidebar, and
 * repeating them here would be two controls for one setting on one screen.
 */
export const TopBar: React.FC<TopBarProps> = ({ title, subtitle, rightAction }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isExpanded = useIsExpanded();
  const { user, merchant, signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <View
      style={{ paddingTop: isExpanded ? 18 : Math.max(insets.top, 12) }}
      className="z-10 border-b border-brand-border bg-brand-bg px-4 pb-3.5 sm:px-6 lg:px-8"
    >
      <View className="mx-auto w-full max-w-7xl flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
          {isExpanded ? null : <Logo size={34} className="shrink-0" />}
          <View className="min-w-0 flex-1">
            <Text
              font="display-bold"
              numberOfLines={1}
              className="text-base text-brand-text sm:text-xl"
            >
              {title ?? merchant?.businessName ?? 'NoParchi'}
            </Text>
            <Text font="body" numberOfLines={1} className="text-xs text-brand-text-muted">
              {subtitle ?? merchant?.location ?? ''}
            </Text>
          </View>
        </View>

        <View className="shrink-0 flex-row items-center gap-2">
          {rightAction}

          {isExpanded ? null : (
            <>
              <LanguageControl />
              <ThemeControl />
            </>
          )}

          {/*
            Who is signed in, and the way out. This used to be a role switcher
            that changed the acting user with no credential at all, which made
            every permission in the app advisory.
          */}
          <View className="flex-row items-center gap-2 rounded-control border border-brand-border bg-brand-surface px-2.5 py-1.5">
            {user?.isOwner ? (
              <Shield size={14} color={colors['accent']} />
            ) : (
              <UserCircle2 size={14} color={colors['text-muted']} />
            )}
            <View>
              <Text font="body-semibold" className="text-xs text-brand-text">
                {user?.name.split(' ')[0] ?? ''}
              </Text>
              <Text font="body-medium" className="text-[10px] text-brand-text-muted">
                {t(user?.isOwner ? 'roles.owner' : 'roles.gatekeeper')}
              </Text>
            </View>
            <Pressable
              onPress={signOut}
              accessibilityRole="button"
              accessibilityLabel={t('common.signOut')}
              className="ml-1 rounded-lg p-1 active:bg-brand-surface-raised"
            >
              <LogOut size={14} color={colors['text-faint']} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};
