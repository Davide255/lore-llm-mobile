import { Stack } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showActionSheet } from './action-sheet';
import { Icon, sf, type IconName } from './icon';
import { brand, useTheme } from '@/theme';

export interface MenuItem {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  disabled?: boolean;
  /** Checkmark state for filter-style menus. */
  selected?: boolean;
  /** Makes this entry a submenu (iOS) / a second sheet (elsewhere); `onPress` is then unused. */
  submenu?: MenuItem[];
  onPress: () => void;
}

export type HeaderItem =
  | {
      kind: 'button';
      label: string;
      icon?: IconName;
      onPress: () => void;
      variant?: 'plain' | 'prominent' | 'done';
      disabled?: boolean;
    }
  | { kind: 'menu'; label: string; icon: IconName; title?: string; items: MenuItem[] }
  /** Splits adjacent iOS buttons into separate glass circles; ignored elsewhere. */
  | { kind: 'spacer' };

const isIOS = Platform.OS === 'ios';

function renderMenuItem(a: MenuItem) {
  if (a.submenu) {
    return (
      <Stack.Toolbar.Menu key={a.label} icon={a.icon ? sf(a.icon) : undefined} title={a.label}>
        {a.submenu.map(renderMenuItem)}
      </Stack.Toolbar.Menu>
    );
  }
  return (
    <Stack.Toolbar.MenuAction
      key={a.label}
      icon={a.icon ? sf(a.icon) : undefined}
      destructive={a.destructive}
      disabled={a.disabled}
      isOn={a.selected}
      onPress={a.onPress}>
      {a.label}
    </Stack.Toolbar.MenuAction>
  );
}

function renderIOS(item: HeaderItem, key: number) {
  if (item.kind === 'spacer') return <Stack.Toolbar.Spacer key={key} width={8} />;
  if (item.kind === 'button') {
    return (
      <Stack.Toolbar.Button
        key={key}
        icon={item.icon ? sf(item.icon) : undefined}
        onPress={item.onPress}
        disabled={item.disabled}
        variant={item.variant}
        tintColor={item.variant === 'prominent' ? brand.purple : undefined}
        accessibilityLabel={item.label}>
        {item.label}
      </Stack.Toolbar.Button>
    );
  }
  return (
    <Stack.Toolbar.Menu key={key} icon={sf(item.icon)} title={item.title} accessibilityLabel={item.label}>
      {item.items.map(renderMenuItem)}
    </Stack.Toolbar.Menu>
  );
}

function openMenu(item: { title?: string; items: MenuItem[] }) {
  showActionSheet({
    title: item.title,
    options: item.items
      .filter((a) => !a.disabled)
      .map((a) => ({
        ...a,
        label: a.selected ? `${a.label}  ✓` : a.label,
        // Opened after the first sheet has gone.
        onPress: a.submenu ? () => setTimeout(() => openMenu({ title: a.label, items: a.submenu! }), 250) : a.onPress,
      })),
  });
}

function AndroidRow({ items }: { items: HeaderItem[] }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      {items.map((item, i) => {
        if (item.kind === 'spacer') return null;
        const onPress = item.kind === 'menu' ? () => openMenu(item) : item.onPress;
        const disabled = item.kind === 'button' && item.disabled;
        if (item.kind === 'button' && !item.icon) {
          const prominent = item.variant === 'prominent';
          return (
            <Pressable
              key={i}
              onPress={onPress}
              disabled={disabled}
              style={[styles.textButton, prominent && { backgroundColor: disabled ? t.fill : t.accent }]}>
              <Text style={{ color: prominent ? (disabled ? t.textMuted : '#fff') : t.accentText, fontSize: 15, fontWeight: '600' }}>
                {item.label}
              </Text>
            </Pressable>
          );
        }
        return (
          <Pressable key={i} onPress={onPress} disabled={disabled} hitSlop={6} style={styles.iconButton} accessibilityLabel={item.label}>
            <Icon name={item.icon!} size={22} color={disabled ? t.textMuted : t.accentText} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Header bar items. On iOS these are real UIBarButtonItems (liquid glass on
 * iOS 26) via `Stack.Toolbar`; elsewhere they fall back to header views.
 */
export function HeaderItems({ left, right }: { left?: HeaderItem[]; right?: HeaderItem[] }) {
  if (isIOS) {
    return (
      <>
        {left && <Stack.Toolbar placement="left">{left.map(renderIOS)}</Stack.Toolbar>}
        {right && <Stack.Toolbar placement="right">{right.map(renderIOS)}</Stack.Toolbar>}
      </>
    );
  }
  return (
    <Stack.Screen
      options={{
        headerLeft: left ? () => <AndroidRow items={left} /> : undefined,
        headerRight: right ? () => <AndroidRow items={right} /> : undefined,
      }}
    />
  );
}

/**
 * Primary "create" action. iOS: a native bottom toolbar (floating glass on
 * iOS 26). Android/web: a Material floating action button.
 */
export function BottomAction({ item }: { item: HeaderItem }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  if (isIOS) {
    return (
      <Stack.Toolbar placement="bottom">
        <Stack.Toolbar.Spacer />
        {renderIOS(item, 0)}
      </Stack.Toolbar>
    );
  }
  if (item.kind === 'spacer') return null;
  const onPress = item.kind === 'menu' ? () => openMenu(item) : item.onPress;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={item.label}
      style={[styles.fab, { bottom: insets.bottom + 24, backgroundColor: t.accent }]}>
      <Icon name={item.icon ?? 'add'} size={28} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  textButton: { height: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(143,92,255,0.45)',
  },
});
