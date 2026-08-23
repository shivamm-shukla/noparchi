import React from 'react';
import { View, Pressable, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../../src/context/ThemeContext';
import { useIsExpanded } from '../../src/hooks/useLayoutMode';
import { elevation } from '../../src/config/elevation';
import { Text } from '../ui/Text';
import { Logo } from '../ui/Logo';

const SIDEBAR_WIDTH = 244;

/**
 * The one navigation control, in both shapes.
 *
 * Narrow: a bar that floats clear of the bottom edge, rounded and shadowed,
 * rather than a flat strip welded to the screen.
 * Wide: a sidebar, the macOS System Settings arrangement, carrying the brand
 * and the appearance controls at either end.
 *
 * Both are driven by the same `state.routes`, so a route hidden by permission
 * (`href: null` in the tabs layout) disappears from both without either shape
 * knowing why.
 */
export function AppTabBar(props: BottomTabBarProps) {
  return useIsExpanded() ? <Sidebar {...props} /> : <FloatingBar {...props} />;
}

/**
 * Routes the navigator is actually willing to show, in order.
 *
 * A tab gated by permission keeps its entry in `state.routes` - expo-router
 * hides it by setting `tabBarItemStyle: { display: 'none' }` and a
 * null-returning `tabBarButton`, not by removing the route. A custom bar has to
 * honour that itself, or a gatekeeper without `can_view_ledger` gets a Ledger
 * tab that the database will then refuse.
 */
function useVisibleRoutes({ state, descriptors }: BottomTabBarProps) {
  return state.routes
    .map((route, index) => ({ route, index, options: descriptors[route.key].options }))
    .filter(({ options }) => {
      const itemStyle = StyleSheet.flatten(options.tabBarItemStyle);
      return itemStyle?.display !== 'none';
    });
}

function useTabPress({ navigation, state }: BottomTabBarProps) {
  return React.useCallback(
    (routeKey: string, routeName: string, index: number) => {
      const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
      // Re-pressing the active tab should not push a duplicate entry.
      if (state.index !== index && !event.defaultPrevented) {
        navigation.navigate(routeName);
      }
    },
    [navigation, state.index]
  );
}

function FloatingBar(props: BottomTabBarProps) {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useVisibleRoutes(props);
  const onPress = useTabPress(props);

  return (
    /*
      Deliberately in the layout flow rather than absolutely positioned. The
      navigator measures this element to decide how much room to leave beneath
      each screen; taking it out of flow would reserve nothing and quietly park
      the bar on top of the last row of every list. The float is margin, not
      position.
    */
    <View style={{ paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 10) }}>
      <View
        style={elevation('card', resolved)}
        className="overflow-hidden rounded-panel border border-brand-border"
      >
        {/*
          The blur is the finish, not the background. On iOS and web it samples
          what is actually behind it; on Android it degrades to a flat tint, so
          it is skipped there rather than paying for a effect that does not
          land. The translucent surface underneath is what keeps the labels
          readable over a busy screen either way.
        */}
        {Platform.OS === 'android' ? null : (
          <BlurView
            intensity={40}
            tint={resolved === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View className="absolute inset-0 bg-brand-surface/85" />

        <View className="flex-row items-stretch px-1.5 py-1.5">
          {items.map(({ route, index, options }) => {
            const focused = props.state.index === index;
            const Icon = options.tabBarIcon;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.title ?? route.name}
                onPress={() => onPress(route.key, route.name, index)}
                className="flex-1 items-center justify-center gap-1 rounded-card py-2 active:bg-brand-surface-raised"
              >
                {Icon
                  ? Icon({
                      focused,
                      color: focused ? colors['accent'] : colors['text-muted'],
                      size: 22,
                    })
                  : null}
                <Text
                  font={focused ? 'body-semibold' : 'body-medium'}
                  numberOfLines={1}
                  className={`text-[11px] ${focused ? 'text-brand-accent' : 'text-brand-text-muted'}`}
                >
                  {options.title ?? route.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function Sidebar(props: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useVisibleRoutes(props);
  const onPress = useTabPress(props);

  return (
    <View
      style={{ width: SIDEBAR_WIDTH, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 14 }}
      className="h-full border-r border-brand-border bg-brand-surface-alt px-3"
    >
      <View className="px-2 mb-6">
        <Logo size={30} wordmark />
      </View>

      <View className="gap-0.5 flex-1">
        {items.map(({ route, index, options }) => {
          const focused = props.state.index === index;
          const Icon = options.tabBarIcon;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => onPress(route.key, route.name, index)}
              className={`flex-row items-center gap-3 rounded-control px-3 py-2.5 ${
                focused ? 'bg-brand-accent/10' : 'active:bg-brand-surface-raised'
              }`}
            >
              {Icon
                ? Icon({
                    focused,
                    color: focused ? colors['accent'] : colors['text-muted'],
                    size: 18,
                  })
                : null}
              <Text
                font={focused ? 'body-semibold' : 'body-medium'}
                numberOfLines={1}
                className={`text-sm ${focused ? 'text-brand-accent' : 'text-brand-text-subtle'}`}
              >
                {options.title ?? route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

    </View>
  );
}
