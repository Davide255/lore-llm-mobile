import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, type ComponentRef } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AttachmentView } from '@/components/attachment-view';
import { HeaderItems, type MenuItem } from '@/components/header-items';
import { confirmDelete, duplicateEntry, shareEntry, starItem } from '@/components/entry-actions';
import { MarkdownView } from '@/components/markdown';
import { AgentAvatar } from '@/components/identity';
import { Banner, ErrorState, HeaderTitle, Loading, ProgressBar, Screen } from '@/components/ui';
import { actions, attempt, useFile, useStars } from '@/data/hooks';
import { fileSize, relativeTime, thousands } from '@/lib/format';
import { checklistProgress } from '@/lib/markdown';
import { projectLabel } from '@/lib/paths';
import { pathParam, routes } from '@/lib/routes';
import { canWrite } from '@/lib/teams';
import { isAttachment } from '@/lib/upload-plan';
import { useTheme } from '@/theme';
import { setTextScale, TEXT_SIZE_PRESETS, useTextScale } from '@/theme/text-size';

/** An uploaded image or PDF has its own view; everything else is a note. */
export default function FileScreen() {
  const path = pathParam(useLocalSearchParams<{ path: string[] }>().path);
  return isAttachment(path) ? <AttachmentView path={path} /> : <NoteScreen path={path} />;
}

/** A3 index.md (read-only) · A4 checklist.md · A5 regular document. */
function NoteScreen({ path }: { path: string }) {
  const t = useTheme();
  const params = useLocalSearchParams<{ path: string[]; heading?: string }>();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const file = useFile(path);
  const doc = file.data;
  const textScale = useTextScale();
  const starred = !!useStars().data?.some((s) => s.path === path);

  useEffect(() => {
    actions.markOpened(path).catch(() => {});
  }, [path]);

  const progress = doc?.role === 'checklist' ? checklistProgress(doc.content) : null;
  const name = path.split('/').pop() ?? '';
  const subtitle = !doc
    ? undefined
    : doc.role === 'index'
      ? projectLabel(doc.project)
      : progress
        ? `${progress.done} di ${progress.total} completate`
        : `${fileSize(doc.size)} · ${relativeTime(doc.updatedAt)}`;

  return (
    <>
      <Stack.Screen options={{ headerTitle: () => <HeaderTitle title={name} subtitle={subtitle} /> }} />
      {doc ? (
        <HeaderItems
          right={[
            ...(doc.role !== 'index' && canWrite(doc.access)
              ? [{ kind: 'button' as const, label: 'Modifica', icon: 'edit' as const, onPress: () => router.push(routes.edit(path)) }, { kind: 'spacer' as const }]
              : []),
            { kind: 'menu', label: 'Altro', icon: 'more', items: menuItems(doc, path, name, textScale, starred) },
          ]}
        />
      ) : null}

      {file.loading ? (
        <Loading />
      ) : file.error || !doc ? (
        <ErrorState error={file.error} onRetry={file.refresh} />
      ) : (
        <Screen
          ref={scroll}
          contentContainerStyle={{ paddingTop: 14 }}
          refreshControl={<RefreshControl refreshing={file.refreshing} onRefresh={file.refresh} />}>
          {doc.role === 'index' && (
            <Banner icon="lock" style={{ marginBottom: 18 }}>
              Indice generato automaticamente. Non modificabile.
            </Banner>
          )}
          {doc.role !== 'index' && !canWrite(doc.access) && (
            <Banner icon="lock" tone="neutral" style={{ marginBottom: 18 }}>
              Sola lettura: sei lettore in questo team.
            </Banner>
          )}
          {doc.author === 'agent' && (
            <View style={styles.editedBy}>
              <AgentAvatar agent={doc.agent} size={18} round />
              <Text style={{ fontSize: 12, color: t.textSecondary, flexShrink: 1 }} numberOfLines={1}>
                Modificato da {doc.agent?.name ?? 'un agente'} · {relativeTime(doc.updatedAt)}
              </Text>
            </View>
          )}
          {progress && progress.total > 0 && <ProgressBar value={progress.done / progress.total} height={5} style={{ marginBottom: 16 }} />}

          <MarkdownView
            content={doc.content}
            path={doc.path}
            anchor={params.heading}
            onAnchor={(y) => scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true })}
            onToggleTask={
              doc.role === 'index' || !canWrite(doc.access)
                ? undefined
                : (line) => attempt(() => actions.toggleTask(doc, line), 'Impossibile aggiornare la checklist')
            }
          />

          {doc.role === 'index' && (
            <>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.hairline, marginVertical: 18 }} />
              <Text style={{ fontSize: 12, color: t.textMuted }}>
                {`Rigenerato ${relativeTime(doc.updatedAt)} · ${thousands(doc.tokenCount ?? 0)} token`}
              </Text>
            </>
          )}
        </Screen>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  editedBy: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
});

/** Note controls under the "…" button; the index is generated, so it can only be shared and resized. */
function menuItems(doc: NonNullable<ReturnType<typeof useFile>['data']>, path: string, name: string, textScale: number, starred: boolean): MenuItem[] {
  const items: MenuItem[] = [];
  const editable = doc.role === 'doc' && canWrite(doc.access);
  if (editable) {
    items.push({ label: 'Rinomina', icon: 'rename', onPress: () => router.push(routes.rename(path)) });
    items.push({ label: 'Sposta in…', icon: 'move', onPress: () => router.push(routes.move(path)) });
    items.push({ label: 'Duplica', icon: 'duplicate', onPress: () => duplicateEntry(path) });
  }
  if (doc.role !== 'index') items.push(starItem(path, starred));
  items.push({ label: 'Condividi', icon: 'share', onPress: () => shareEntry(path, name) });
  if (editable) {
    items.push({ label: 'Elimina', icon: 'delete', destructive: true, onPress: () => confirmDelete({ path, name, kind: 'file' }, () => router.back()) });
  }
  // A native menu cannot hold a slider (that one is in Settings), so the size is a submenu of steps.
  items.push({
    label: 'Dimensione del testo',
    icon: 'heading',
    onPress: () => {},
    submenu: TEXT_SIZE_PRESETS.map((v) => ({
      label: `${Math.round(v * 100)}%${v === 1 ? ' · Predefinita' : ''}`,
      selected: Math.abs(v - textScale) < 0.03,
      onPress: () => setTextScale(v),
    })),
  });
  return items;
}
