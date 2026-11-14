import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icon';
import { Sidebar } from './sidebar';
import { useTheme } from '@/theme';
import { SIDEBAR_WIDTH, sidebarOpen } from '@/theme/layout';

const DURATION = 260;
/** The native back button (44pt) plus the gap between the two glass buttons. */
const BACK_BUTTON_SPAN = 52;
/** First path segment of the three tab screens, which have no back button. */
const TAB_ROOTS: ReadonlySet<string> = new Set(['', 'activity', 'settings']);
const EASING = Easing.out(Easing.cubic);

/**
 * The tablet sidebar with an animated collapse: it slides shut and the content pane
 * follows the width. `SidebarReveal` brings it back.
 */
export function SidebarShell() {
  const open = sidebarOpen.useValue();
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: DURATION, easing: EASING });
  }, [open, progress]);

  const sidebarStyle = useAnimatedStyle(() => ({ width: SIDEBAR_WIDTH * progress.value, opacity: progress.value }));

  return (
    <>
      <Animated.View style={[{ overflow: 'hidden' }, sidebarStyle]} pointerEvents={open ? 'auto' : 'none'}>
        {/* Fixed width inside, so the contents slide away instead of squeezing. */}
        <View style={{ width: SIDEBAR_WIDTH, flex: 1 }}>
          <Sidebar />
        </View>
      </Animated.View>
    </>
  );
}

/**
 * The "show sidebar" button, floating over the content's top-left corner (above the
 * large title, no reserved margin). Beside a back button it moves over to make room.
 */
export function SidebarReveal() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const open = sidebarOpen.useValue();
  const pathname = usePathname();
  const progress = useSharedValue(open ? 0 : 1);

  useEffect(() => {
    progress.value = withTiming(open ? 0 : 1, { duration: DURATION, easing: EASING });
  }, [open, progress]);

  const button = (
    <Pressable
      onPress={() => sidebarOpen.set(true)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Mostra la barra laterale"
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="sidebar" size={20} color={t.text} />
    </Pressable>
  );
  // Pushed screens have a back button at the left of the header bar: sit beside it.
  const strip = insets.right > 0;
  const hasBack = !TAB_ROOTS.has(pathname.split('/')[1] ?? '') && insets.right === 0;
  const beside = useSharedValue(hasBack ? 1 : 0);
  useEffect(() => {
    beside.value = withTiming(hasBack ? 1 : 0, { duration: 200, easing: EASING });
  }, [hasBack, beside]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: BACK_BUTTON_SPAN * beside.value }, { scale: 0.85 + 0.15 * progress.value }],
  }));
  return (
    <Animated.View
      pointerEvents={open ? 'none' : 'box-none'}
      style={[{ position: 'absolute', zIndex: 10, top: insets.top + (strip ? STRIP_TOP : 0), left: insets.left + (strip ? STRIP_LEFT : 10) }, style]}>
      {/* Liquid glass like the native header buttons; a plain disc where glass is unavailable. */}
      {isLiquidGlassAvailable() ? (
        <GlassView glassEffectStyle="regular" isInteractive style={{ width: 44, height: 44, borderRadius: 22 }}>
          {button}
        </GlassView>
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: t.scheme === 'dark' ? 'rgba(38,37,43,0.96)' : 'rgba(255,255,255,0.96)',
            borderColor: t.hairline,
            borderWidth: StyleSheet.hairlineWidth,
          }}>
          {button}
        </View>
      )}
    </Animated.View>
  );
}

/** Height of the strip reserved above the content for the reveal button. */
const REVEAL_ROW = 38;
/** Where the button sits on a device with rounded corners and a side strip (the display corners aren't reported as insets). */
const STRIP_TOP = 16;
const STRIP_LEFT = 20;

/**
 * Whether this device has no header bar across the top (iPhone Duo keeps its status and
 * navigation controls in a side strip), so the reveal button has nowhere of its own to sit.
 */
function useSideStrip() {
  return useSafeAreaInsets().right > 0;
}

/**
 * The content pane. On a device with a side strip it makes room at the top for the
 * reveal button while the sidebar is collapsed, so the button never covers a title.
 */
export function ContentPane({ children }: { children: ReactNode }) {
  const open = sidebarOpen.useValue();
  const strip = useSideStrip();
  const progress = useSharedValue(open ? 0 : 1);
  useEffect(() => {
    progress.value = withTiming(open ? 0 : 1, { duration: DURATION, easing: EASING });
  }, [open, progress]);
  const style = useAnimatedStyle(() => ({ paddingTop: strip ? REVEAL_ROW * progress.value : 0 }));
  return <Animated.View style={[{ flex: 1, minWidth: 0 }, style]}>{children}</Animated.View>;
}
