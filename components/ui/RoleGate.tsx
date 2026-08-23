import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { ShieldAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import { useThemeColors } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import {
  permissionDescription,
  permissionLabel,
  type PermissionKey,
} from '../../src/config/permissions';

interface RoleGateProps {
  permission: PermissionKey;
  children: React.ReactNode;
  title?: string;
}

/**
 * Hides a screen from staff who lack a permission.
 *
 * This is a courtesy, not a control. The real enforcement is in the database:
 * the transactions SELECT policy requires can_view_ledger, and validate_ticket
 * checks can_verify_tickets from the JWT before it will record a scan. Someone
 * bypassing this component gets an empty screen, not data.
 *
 * Note what is deliberately absent: any way to escalate. The previous version
 * rendered a "Switch to Owner (Root Admin)" button on this very screen, so the
 * remedy for being denied access was one tap and no credential.
 */
export const RoleGate: React.FC<RoleGateProps> = ({ permission, children, title }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { can } = useAuth();

  if (can(permission)) return <>{children}</>;

  return (
    <View className="flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md items-center p-6 border-brand-warning/30">
        <View className="w-16 h-16 rounded-2xl bg-brand-warning/10 border border-brand-warning/30 items-center justify-center mb-4">
          <ShieldAlert size={32} color={colors['warning']} />
        </View>

        <Text font="display-bold" className="mb-2 text-center text-xl text-brand-text">
          {title ?? t('roleGate.title')}
        </Text>

        <Text font="body" className="text-center text-sm leading-5 text-brand-text-muted">
          {permissionDescription(permission)}
        </Text>

        <Text font="body" className="mt-4 text-center text-xs leading-5 text-brand-text-faint">
          {t('roleGate.askOwner', { permission: permissionLabel(permission) })}
        </Text>
      </Card>
    </View>
  );
};
