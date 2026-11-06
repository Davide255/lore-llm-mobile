import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Cell, IconWell, ProgressBar } from './ui';
import { dismissUpload, retryUpload, type UploadItem } from '@/data/uploads';
import { fileSize } from '@/lib/format';
import { attachmentKind, percent } from '@/lib/upload-plan';
import { useTheme } from '@/theme';

function iconFor(item: UploadItem): IconName {
  if (item.kind === 'folder') return 'folderFill';
  const kind = attachmentKind(item.name);
  return kind === 'pdf' ? 'pdf' : kind === 'image' ? 'image' : 'doc';
}

/**
 * A file or folder on its way up: grayed, with a bar and the percentage of the bytes sent. A folder is
 * one row counting all its files. When it fails the row stays, in color, with the reason and the way
 * to try again. It is not tappable: there is nothing to open until it has arrived.
 */
export function UploadRow({ item }: { item: UploadItem }) {
  const t = useTheme();
  const failed = item.state === 'error';
  const pct = percent(item.sent, item.total);
  const sizes = `${fileSize(item.sent)} di ${fileSize(item.total)}`;
  const subtitle = failed
    ? item.error
    : item.state === 'queued'
      ? 'In attesa'
      : item.kind === 'folder'
        ? `${item.done} di ${item.count} file · ${sizes}`
        : sizes;

  return (
    <View style={{ opacity: failed ? 1 : 0.55 }}>
      <Cell
        icon={
          failed ? (
            <IconWell name="warning" background={t.errorSoft} color={t.danger} />
          ) : (
            <IconWell name={iconFor(item)} filled={item.kind === 'folder'} color={item.kind === 'folder' ? t.folder : undefined} />
          )
        }
        title={item.name}
        mono={item.kind === 'file'}
        titleColor={failed ? t.danger : undefined}
        subtitle={subtitle}
        right={
          failed ? (
            <View style={styles.actions}>
              <Action icon="restore" label="Riprova" color={t.accentText} onPress={() => retryUpload(item.id)} />
              <Action icon="close" label="Rimuovi" color={t.textMuted} onPress={() => dismissUpload(item.id)} />
            </View>
          ) : (
            <View style={styles.actions}>
              <Text style={[styles.percent, { color: t.textSecondary }]}>{item.state === 'queued' ? '' : `${pct}%`}</Text>
              <Action icon="close" label="Annulla caricamento" color={t.textMuted} onPress={() => dismissUpload(item.id)} />
            </View>
          )
        }>
        {failed ? null : <ProgressBar value={item.state === 'queued' ? 0 : pct / 100} style={{ marginTop: 7 }} />}
      </Cell>
    </View>
  );
}

function Action({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={label} style={styles.action}>
      <Icon name={icon} size={18} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  action: { padding: 2 },
  percent: { fontSize: 13, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'right' },
});
