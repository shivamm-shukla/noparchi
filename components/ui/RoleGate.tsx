import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { ShieldAlert } from 'lucide-react-native';
import { Card } from './Card';
import { useThemeColors } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { PERMISSION_REGISTRY, type PermissionKey } from '../../src/config/permissions';

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
  const { can } = useAuth();

  if (can(permission)) return <>{children}</>;

  const meta = PERMISSION_REGISTRY[permission];

  return (
    <View className="flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md items-center p-6 border-brand-warning/30">
        <View className="w-16 h-16 rounded-2xl bg-brand-warning/10 border border-brand-warning/30 items-center justify-center mb-4">
          <ShieldAlert size={32} color={colors['warning']} />
        </View>

        <Text font="display-bold" className="mb-2 text-center text-xl text-brand-text">
          {title ?? 'Not available on your account'}
        </Text>

        <Text font="body" className="text-center text-sm leading-5 text-brand-text-muted">
          {meta.description}
        </Text>

        <Text font="body" className="mt-4 text-center text-xs leading-5 text-brand-text-faint">
          Ask the business owner to switch on “{meta.label}” for you in Settings → Staff.
        </Text>
      </Card>
    </View>
  );
};
