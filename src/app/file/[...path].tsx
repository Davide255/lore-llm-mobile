import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { HeaderItems } from '@/components/header-items';
import { MarkdownView } from '@/components/markdown';
import { AgentAvatar } from '@/components/identity';
import { Banner, ErrorState, HeaderTitle, Loading, ProgressBar, Screen } from '@/components/ui';
import { actions, attempt, useFile } from '@/data/hooks';
import { fileSize, relativeTime, thousands } from '@/lib/format';
import { checklistProgress } from '@/lib/markdown';
import { projectLabel } from '@/lib/paths';
import { pathParam, routes } from '@/lib/routes';
import { canWrite } from '@/lib/teams';
import { useTheme } from '@/theme';

/** A3 index.md (read-only) · A4 checklist.md · A5 regular document. */
export default function FileScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ path: string[]; heading?: string }>();
  const path = pathParam(params.path);
  const scroll = useRef<ScrollView>(null);
  const file = useFile(path);
  const doc = file.data;

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
      {doc?.role === 'index' ? (
        <HeaderItems
          right={[{ kind: 'button', label: 'Condividi', icon: 'share', onPress: () => Share.share({ title: name, message: doc.content }) }]}
        />
      ) : doc && canWrite(doc.access) ? (
        <HeaderItems right={[{ kind: 'button', label: 'Modifica', onPress: () => router.push(routes.edit(path)) }]} />
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
