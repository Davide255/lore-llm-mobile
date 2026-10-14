import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { RefreshControl, Share, StyleSheet, Text, View } from 'react-native';

import { HeaderItems } from '@/components/header-items';
import { MarkdownView } from '@/components/markdown';
import { AgentAvatar } from '@/components/identity';
import { Banner, ErrorState, HeaderTitle, Loading, ProgressBar, Screen } from '@/components/ui';
import { actions, attempt, useFile } from '@/data/hooks';
import { fileSize, relativeTime, thousands } from '@/lib/format';
import { checklistProgress } from '@/lib/markdown';
import { pathParam, routes } from '@/lib/routes';
import { useTheme } from '@/theme';

/** A3 index.md (read-only) · A4 checklist.md · A5 regular document. */
export default function FileScreen() {
  const t = useTheme();
  const path = pathParam(useLocalSearchParams<{ path: string[] }>().path);
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
      ? doc.project
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
      ) : doc ? (
        <HeaderItems right={[{ kind: 'button', label: 'Modifica', onPress: () => router.push(routes.edit(path)) }]} />
      ) : null}

      {file.loading ? (
        <Loading />
      ) : file.error || !doc ? (
        <ErrorState error={file.error} onRetry={file.refresh} />
      ) : (
        <Screen
          contentContainerStyle={{ paddingTop: 14 }}
          refreshControl={<RefreshControl refreshing={file.refreshing} onRefresh={file.refresh} />}>
          {doc.role === 'index' && (
            <Banner icon="lock" style={{ marginBottom: 18 }}>
              Indice generato automaticamente. Non modificabile.
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
            onToggleTask={
              doc.role === 'index'
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
