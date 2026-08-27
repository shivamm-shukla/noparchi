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

interface TopBarProps {
  title?: string;
  subtitle?: string;
  /** Screen-specific control, e.g. "Issue pass" or a date range picker. */
  rightAction?: React.ReactNode;
}

/**
 * The bar above every merchant screen.
 *
 * On a wide layout everything fits one row, and the brand and appearance
 * controls are left to the sidebar - repeating them here would be two controls
 * for one setting on one screen.
 *
 * On a phone it carries less, and gets a second row only when a screen asks
 * for one. Everything this bar holds is fixed-width, so the arithmetic on a
 * 390pt handset decides the design: the mark, the account chip and 32pt of
 * padding leave the business name about 184pt. Add the two appearance controls
 * and that falls to 92pt, which truncates "Metro Hub Parking" to "Metro Hub
 * Pa...". Add the screen's action on the same line and the whole row overflows
 * - React Native Web clips rather than scrolls, so the action simply lands on
 * top of the mark.
 *
 * The appearance controls are therefore not here on a phone. They are two taps
 * away in Settings -> Appearance, which already owns them, and both are a
 * set-once device preference rather than something anyone toggles mid-shift.
 * Repeating them in the bar cost the business name half its width on every
 * screen, and cost Ledger, Scanner and Settings - none of which has an action -
 * a full 48pt row that held nothing else.
 *
 * A wide layout has room for all of it, and puts appearance in the sidebar.
 */
export const TopBar: React.FC<TopBarProps> = ({ title, subtitle, rightAction }) => {
  const insets = useSafeAreaInsets();
  const isExpanded = useIsExpanded();
  const { merchant } = useAuth();

  const heading = (
    <View className="min-w-0 flex-1">
      <Text font="display-bold" numberOfLines={1} className="text-base text-brand-text sm:text-xl">
        {title ?? merchant?.businessName ?? 'NoParchi'}
      </Text>
      <Text font="body" numberOfLines={1} className="text-xs text-brand-text-muted">
        {subtitle ?? merchant?.location ?? ''}
      </Text>
    </View>
  );

  return (
    <View
      style={{ paddingTop: isExpanded ? 18 : Math.max(insets.top, 12) }}
      className="z-10 border-b border-brand-border bg-brand-bg px-4 pb-3 sm:px-6 lg:px-8"
    >
      <View className="mx-auto w-full max-w-7xl gap-2.5">
        <View className="flex-row items-center gap-2.5">
          {isExpanded ? null : <Logo size={32} className="shrink-0" />}
          {heading}

          {isExpanded ? (
            <View className="shrink-0 flex-row items-center gap-2">
              {rightAction}
              <AccountChip />
            </View>
          ) : (
            <AccountChip />
          )}
        </View>

        {/*
          A second row only when the screen actually asks for one. Rendering an
          empty flex row still costs its gap, so this is a null and not an
          invisible container.
        */}
        {!isExpanded && rightAction ? (
          <View className="flex-row items-center justify-end">{rightAction}</View>
        ) : null}
      </View>
    </View>
  );
};

/**
 * Who is signed in, and the way out.
 *
 * This used to be a role switcher that changed the acting user with no
 * credential at all, which made every permission in the app advisory.
 */
const AccountChip: React.FC = () => {
  const { colors } = useTheme();
  const { user, signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <View className="shrink-0 flex-row items-center gap-2 rounded-control border border-brand-border bg-brand-surface px-2.5 py-1.5">
      {user?.isOwner ? (
        <Shield size={14} color={colors['accent']} />
      ) : (
        <UserCircle2 size={14} color={colors['text-muted']} />
      )}
      <View>
        <Text font="body-semibold" numberOfLines={1} className="text-xs text-brand-text">
          {user?.name.split(' ')[0] ?? ''}
        </Text>
        <Text font="body-medium" numberOfLines={1} className="text-[10px] text-brand-text-muted">
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
  );
};
