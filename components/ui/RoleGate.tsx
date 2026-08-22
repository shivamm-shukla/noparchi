import React from 'react';
import { View, Text } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { Button } from './Button';
import { Card } from './Card';
import { useApp } from '../../src/context/AppContext';

interface RoleGateProps {
  permissionKey: 'can_view_ledger' | 'can_verify_tickets' | 'can_edit_settings' | 'can_issue_refund';
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

export const RoleGate: React.FC<RoleGateProps> = ({
  permissionKey,
  children,
  fallbackTitle = 'Access Restricted',
  fallbackMessage = 'You do not have permission to access this module. Please request access from the Merchant Owner in Staff Management.',
}) => {
  const { currentUser, staffList, switchUser } = useApp();

  const isOwner = currentUser.isOwner;
  const hasPermission = isOwner || currentUser.permission?.[permissionKey] === true;

  if (hasPermission) {
    return <>{children}</>;
  }

  const ownerUser = staffList.find((u) => u.isOwner);

  return (
    <View className="flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md items-center text-center p-6 border-amber-500/30 bg-slate-900/90">
        <View className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 items-center justify-center mb-4">
          <ShieldAlert size={32} color="#F59E0B" />
        </View>

        <Text className="text-xl font-bold text-slate-100 mb-2 text-center">
          {fallbackTitle}
        </Text>

        <Text className="text-sm text-slate-400 text-center mb-6 leading-5">
          {fallbackMessage}
        </Text>

        <View className="bg-slate-800/80 rounded-xl p-3 w-full mb-6 border border-slate-700">
          <Text className="text-xs text-slate-400 font-semibold mb-1">
            Current Active Role:
          </Text>
          <Text className="text-sm font-bold text-slate-200">
            {currentUser.name} ({currentUser.isOwner ? 'Owner' : 'Gatekeeper Staff'})
          </Text>
        </View>

        {ownerUser && (
          <Button
            title="Switch to Owner (Root Admin)"
            variant="primary"
            fullWidth
            onPress={() => switchUser(ownerUser.id)}
          />
        )}
      </Card>
    </View>
  );
};
