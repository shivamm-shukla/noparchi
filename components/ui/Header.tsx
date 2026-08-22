import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, UserCircle2, LogOut } from 'lucide-react-native';
import theme from '../../src/config/theme';
import { useAuth } from '../../src/context/AuthContext';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, rightAction }) => {
  const insets = useSafeAreaInsets();
  const { user, merchant, signOut } = useAuth();

  return (
    <View
      style={{ paddingTop: Math.max(insets.top, 12) }}
      className="bg-slate-950 border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 pb-3.5 z-10"
    >
      <View className="max-w-7xl mx-auto w-full flex-row items-center justify-between gap-3">
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 mb-0.5">
            <View className="w-2 h-2 rounded-full bg-emerald-500" />
            <Text className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">
              NoParchi Live
            </Text>
          </View>
          <Text numberOfLines={1} className="text-base sm:text-xl font-extrabold text-slate-100">
            {title ?? merchant?.businessName ?? 'NoParchi'}
          </Text>
          <Text numberOfLines={1} className="text-xs text-slate-400">
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
          <View className="flex-row items-center gap-2 bg-slate-900 border border-slate-700/80 px-3 py-1.5 rounded-xl">
            {user?.isOwner ? (
              <Shield size={14} color={theme.semantic.accent} />
            ) : (
              <UserCircle2 size={14} color={theme.semantic.textMuted} />
            )}
            <View>
              <Text className="text-xs font-bold text-slate-200">
                {user?.name.split(' ')[0] ?? 'Account'}
              </Text>
              <Text className="text-[10px] text-emerald-400 font-medium">
                {user?.isOwner ? 'Owner' : 'Gatekeeper'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={signOut}
              accessibilityLabel="Sign out"
              className="ml-1 p-1 rounded-lg active:bg-slate-800"
            >
              <LogOut size={14} color={theme.semantic.textFaint} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};
