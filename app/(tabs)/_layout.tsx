import React from 'react';
import { Tabs } from 'expo-router';
import { LayoutDashboard, BookOpen, ScanLine, Settings } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/context/AuthContext';
import { useIsExpanded } from '../../src/hooks/useLayoutMode';
import { AppTabBar } from '../../components/nav/AppTabBar';

export default function TabLayout() {
  const { can } = useAuth();
  const { t } = useTranslation();
  const isExpanded = useIsExpanded();

  return (
    <Tabs
      // One control in two shapes; the navigator only has to say which edge it
      // belongs on. See components/nav/AppTabBar.
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: isExpanded ? 'left' : 'bottom',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.dashboard'),
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: t('nav.ledger'),
          // Hidden rather than shown-and-blocked for staff who cannot use it.
          // The screen still renders RoleGate, and the database still refuses
          // the rows - this only keeps the tab bar honest about what is usable.
          href: can('can_view_ledger') ? undefined : null,
          tabBarIcon: ({ color, size }) => <BookOpen size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: t('nav.scanner'),
          href: can('can_verify_tickets') ? undefined : null,
          tabBarIcon: ({ color, size }) => <ScanLine size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('nav.settings'),
          tabBarIcon: ({ color, size }) => <Settings size={size ?? 22} color={color} />,
        }}
      />
    </Tabs>
  );
}
