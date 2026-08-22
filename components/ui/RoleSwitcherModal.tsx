import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { UserCheck, Shield, KeyRound, X } from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { Badge } from './Badge';

interface RoleSwitcherModalProps {
  visible: boolean;
  onClose: () => void;
}

export const RoleSwitcherModal: React.FC<RoleSwitcherModalProps> = ({ visible, onClose }) => {
  const { currentUser, staffList, switchUser } = useApp();

  const handleSelectUser = async (userId: string) => {
    await switchUser(userId);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/70 items-center justify-center p-4">
        <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-4 border-b border-slate-800">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center">
                <UserCheck size={20} color="#10B981" />
              </View>
              <View>
                <Text className="text-lg font-bold text-slate-100">Switch Active Role</Text>
                <Text className="text-xs text-slate-400">Test multi-tenant RBAC permissions</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 items-center justify-center"
            >
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* User List */}
          <ScrollView className="max-h-96 my-4">
            <View className="gap-3">
              {staffList.map((user) => {
                const isActive = currentUser.id === user.id;
                return (
                  <TouchableOpacity
                    key={user.id}
                    onPress={() => handleSelectUser(user.id)}
                    activeOpacity={0.7}
                    className={`p-4 rounded-2xl border transition-all ${
                      isActive
                        ? 'bg-emerald-500/10 border-emerald-500/50'
                        : 'bg-slate-800/60 border-slate-700/60 active:bg-slate-800'
                    }`}
                  >
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center gap-2">
                        {user.isOwner ? (
                          <Shield size={16} color="#10B981" />
                        ) : (
                          <KeyRound size={16} color="#94A3B8" />
                        )}
                        <Text className="text-sm font-bold text-slate-100">
                          {user.name}
                        </Text>
                      </View>
                      <Badge
                        label={user.isOwner ? 'Root Owner' : 'Gatekeeper'}
                        variant={user.isOwner ? 'emerald' : 'info'}
                        size="sm"
                      />
                    </View>

                    <Text className="text-xs text-slate-400 mb-2">
                      Phone: {user.phone}
                    </Text>

                    {/* Permissions summary */}
                    <View className="flex-row flex-wrap gap-1.5 pt-2 border-t border-slate-700/40">
                      <Badge
                        label={user.isOwner || user.permission?.can_view_ledger ? 'Ledger: Allowed' : 'Ledger: Locked'}
                        variant={user.isOwner || user.permission?.can_view_ledger ? 'success' : 'neutral'}
                        size="sm"
                      />
                      <Badge
                        label={user.isOwner || user.permission?.can_verify_tickets ? 'Scanner: Allowed' : 'Scanner: Locked'}
                        variant={user.isOwner || user.permission?.can_verify_tickets ? 'success' : 'neutral'}
                        size="sm"
                      />
                      <Badge
                        label={user.isOwner || user.permission?.can_edit_settings ? 'Settings: Allowed' : 'Settings: Locked'}
                        variant={user.isOwner || user.permission?.can_edit_settings ? 'success' : 'neutral'}
                        size="sm"
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <Text className="text-xs text-slate-500 text-center">
            Switching updates the active user session across all screens.
          </Text>
        </View>
      </View>
    </Modal>
  );
};
