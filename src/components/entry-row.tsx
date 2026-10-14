import { Link, router } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { showActionSheet } from './action-sheet';
import { confirmDelete, entryMenu } from './entry-actions';
import { Icon, sf, type IconName } from './icon';
import { AgentAvatar } from './identity';
import { Cell, IconWell } from './ui';
import type { Entry } from '@/api';
import { fileSize, plural, relativeTime } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useTheme } from '@/theme';

function SwipeAction({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.swipeAction, { backgroundColor: color }]}>
      <Icon name={icon} size={20} color="#fff" />
      <Text style={styles.swipeLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * A file or folder row: tap to open, swipe left for Rename/Delete (E1),
 * long-press for the context menu with preview (E2). index.md is neither
 * swipeable nor deletable.
 */
export function EntryRow({
  entry,
  icon,
  subtitle,
  right,
  children,
}: {
  entry: Entry;
  icon?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const t = useTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const isFile = entry.kind === 'file';
  const special = isFile && entry.role !== 'doc';
  const href = routes.entry(entry.path, entry.kind);
  const menu = entryMenu(entry);

  const defaultIcon =
    entry.kind === 'folder' ? (
      <IconWell name="folderFill" color={t.folder} filled />
    ) : (
      <IconWell name={entry.role === 'index' ? 'index' : entry.role === 'checklist' ? 'checklist' : 'doc'} />
    );
  const defaultSubtitle =
    entry.kind === 'folder'
      ? [plural(entry.fileCount, 'file', 'file'), entry.folderCount ? plural(entry.folderCount, 'sottocartella', 'sottocartelle') : null]
          .filter(Boolean)
          .join(' · ')
      : entry.author === 'agent'
        ? `${fileSize(entry.size)} · ${entry.agent?.name ?? 'Agente'} · ${relativeTime(entry.updatedAt)}`
        : `${fileSize(entry.size)} · ${relativeTime(entry.updatedAt)}`;
  // Files an agent wrote last carry its face, so agent edits stand out in a listing.
  const defaultRight = isFile && entry.author === 'agent' ? <AgentAvatar agent={entry.agent} size={20} round /> : undefined;

  const cell = (
    <Cell
      icon={icon ?? defaultIcon}
      title={entry.name}
      mono={isFile}
      strong={special}
      subtitle={subtitle ?? defaultSubtitle}
      right={right ?? defaultRight}
      chevron
      // On iOS the wrapping <Link asChild> injects onPress (and the native context menu).
      onPress={Platform.OS === 'ios' ? undefined : () => router.push(href)}
      onLongPress={Platform.OS === 'ios' ? undefined : () => showActionSheet({ title: entry.name, options: menu })}>
      {children}
    </Cell>
  );

  const row =
    Platform.OS === 'ios' ? (
      <Link href={href} asChild>
        <Link.Trigger>{cell}</Link.Trigger>
        <Link.Preview />
        <Link.Menu>
          {menu.map((a) => (
            <Link.MenuAction key={a.label} icon={a.icon ? sf(a.icon) : undefined} destructive={a.destructive} onPress={a.onPress}>
              {a.label}
            </Link.MenuAction>
          ))}
        </Link.Menu>
      </Link>
    ) : (
      cell
    );

  if (special) return <View style={{ backgroundColor: t.cell }}>{row}</View>;

  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={1.6}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={{ backgroundColor: t.cell }}
      renderRightActions={() => (
        <View style={{ flexDirection: 'row' }}>
          <SwipeAction
            icon="rename"
            label="Rinomina"
            color={t.swipeNeutral}
            onPress={() => {
              swipe.current?.close();
              router.push(routes.rename(entry.path));
            }}
          />
          <SwipeAction
            icon="delete"
            label="Elimina"
            color={t.danger}
            onPress={() => {
              swipe.current?.close();
              confirmDelete({ ...entry, fileCount: entry.kind === 'folder' ? entry.fileCount : undefined });
            }}
          />
        </View>
      )}>
      <View style={{ backgroundColor: t.cell }}>{row}</View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  swipeAction: { width: 72, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeLabel: { color: '#fff', fontSize: 10.5, fontWeight: '500' },
});
