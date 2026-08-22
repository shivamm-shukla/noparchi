import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, UserCircle2, ArrowRightLeft, Radio } from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { RoleSwitcherModal } from './RoleSwitcherModal';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, rightAction }) => {
  const insets = useSafeAreaInsets();
  const { merchant, currentUser } = useApp();
  const [roleModalVisible, setRoleModalVisible] = useState(false);

  return (
    <View
      style={{ paddingTop: Math.max(insets.top, 12) }}
      className="bg-slate-950 border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 pb-3.5 z-10"
    >
      <View className="max-w-7xl mx-auto w-full flex-row items-center justify-between gap-3">
        {/* Left: App & Business Identity */}
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 mb-0.5">
            <View className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <Text className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">
              NoParchi Live
            </Text>
          </View>
          <Text
            numberOfLines={1}
            className="text-base sm:text-xl font-extrabold text-slate-100 truncate"
          >
            {title || merchant.businessName}
          </Text>
          <Text
            numberOfLines={1}
            className="text-xs text-slate-400 truncate"
          >
            {subtitle || merchant.location}
          </Text>
        </View>

        {/* Right: Role Switcher & Action */}
        <View className="flex-row items-center gap-2 sm:gap-3 shrink-0">
          {rightAction}

          {/* Quick Role Switcher Pill */}
          <TouchableOpacity
            onPress={() => setRoleModalVisible(true)}
            activeOpacity={0.75}
            className="flex-row items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 px-3 py-1.5 rounded-xl transition-all"
          >
            {currentUser.isOwner ? (
              <Shield size={14} color="#10B981" />
            ) : (
              <UserCircle2 size={14} color="#94A3B8" />
            )}
            <View className="hidden sm:flex">
              <Text className="text-xs font-bold text-slate-200">
                {currentUser.name.split(' ')[0]}
              </Text>
              <Text className="text-[10px] text-emerald-400 font-medium">
                {currentUser.isOwner ? 'Owner' : 'Gatekeeper'}
              </Text>
            </View>
            <ArrowRightLeft size={12} color="#64748B" />
          </TouchableOpacity>
        </View>
      </View>

      <RoleSwitcherModal
        visible={roleModalVisible}
        onClose={() => setRoleModalVisible(false)}
      />
    </View>
  );
};
