import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, BookOpen, ScanLine, Settings } from 'lucide-react-native';
import theme from '../../src/config/theme';
import { useAuth } from '../../src/context/AuthContext';

export default function TabLayout() {
  const { can } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.semantic.accent,
        tabBarInactiveTintColor: theme.semantic.textFaint,
        tabBarStyle: {
          backgroundColor: theme.semantic.surface,
          borderTopColor: theme.semantic.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: 'Ledger',
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
          title: 'Scanner',
          href: can('can_verify_tickets') ? undefined : null,
          tabBarIcon: ({ color, size }) => <ScanLine size={size ?? 22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size ?? 22} color={color} />,
        }}
      />
    </Tabs>
  );
}
