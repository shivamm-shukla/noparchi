import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, UserCircle2, LogOut } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, rightAction }) => {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user, merchant, signOut } = useAuth();

  return (
    <View
      style={{ paddingTop: Math.max(insets.top, 12) }}
      className="bg-brand-bg border-b border-brand-border/80 px-4 sm:px-6 lg:px-8 pb-3.5 z-10"
    >
      <View className="max-w-7xl mx-auto w-full flex-row items-center justify-between gap-3">
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 mb-0.5">
            <View className="w-2 h-2 rounded-full bg-brand-accent" />
            <Text className="text-[10px] font-bold text-brand-accent tracking-wider uppercase">
              NoParchi Live
            </Text>
          </View>
          <Text numberOfLines={1} className="text-base sm:text-xl font-extrabold text-brand-text">
            {title ?? merchant?.businessName ?? 'NoParchi'}
          </Text>
          <Text numberOfLines={1} className="text-xs text-brand-text-muted">
            {subtitle ?? merchant?.location ?? ''}
          </Text>
        </View>

        <View className="flex-row items-center gap-2 sm:gap-3 shrink-0">
          {rightAction}

          {/*
            Shows who is signed in and lets them sign out. It used to be a role
            switcher that changed the acting user with no credential at all,
            which made every permission in the app advisory.
          */}
          <View className="flex-row items-center gap-2 bg-brand-surface border border-brand-border-strong/80 px-3 py-1.5 rounded-xl">
            {user?.isOwner ? (
              <Shield size={14} color={colors['accent']} />
            ) : (
              <UserCircle2 size={14} color={colors['text-muted']} />
            )}
            <View>
              <Text className="text-xs font-bold text-brand-text">
                {user?.name.split(' ')[0] ?? 'Account'}
              </Text>
              <Text className="text-[10px] text-brand-accent font-medium">
                {user?.isOwner ? 'Owner' : 'Gatekeeper'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={signOut}
              accessibilityLabel="Sign out"
              className="ml-1 p-1 rounded-lg active:bg-brand-surface-raised"
            >
              <LogOut size={14} color={colors['text-faint']} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};
