import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';

import type { Project } from '@/api';
import { EntryRow } from '@/components/entry-row';
import { HeaderItems } from '@/components/header-items';
import { PendingInvites } from '@/components/invites';
import { projectIcons } from '@/components/icon';
import { Cell, EmptyState, ErrorState, IconWell, Loading, Pill, ProgressBar, Screen, Section } from '@/components/ui';
import { useMyInvites, useProjects, useRecentFiles, useSummary } from '@/data/hooks';
import { plural, relativeTime } from '@/lib/format';
import { projectLabel } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { useTheme, type Theme } from '@/theme';

/** Accent wells for the brand-coloured project icons (A1). */
function wellColors(p: Project, t: Theme) {
  if (p.icon === 'fitness') return { background: t.accentWell, color: t.accentText };
  if (p.icon === 'web') return { background: t.folderWell, color: t.folder };
  return {};
}

/** A1 — Projects. */
export default function ProjectsScreen() {
  const t = useTheme();
  const projects = useProjects();
  const summary = useSummary();
  const recent = useRecentFiles(3);
  const invites = useMyInvites();
  const [filter, setFilter] = useState('');

  const visible = (projects.data ?? []).filter((p) => p.title.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <>
      <Stack.Screen options={{ title: 'Progetti' }} />
      <Stack.SearchBar placeholder="Cerca" hideWhenScrolling={false} onChangeText={(e) => setFilter(e.nativeEvent.text)} />
      <HeaderItems right={[{ kind: 'button', label: 'Nuovo progetto', icon: 'addCircle', onPress: () => router.push(routes.newProject()) }]} />
      {projects.loading ? (
        <Loading />
      ) : projects.error ? (
        <ErrorState error={projects.error} onRetry={projects.refresh} />
      ) : (
        <Screen
          refreshControl={
            <RefreshControl refreshing={projects.refreshing} onRefresh={() => Promise.all([projects.refresh(), summary.refresh(), recent.refresh(), invites.refresh()])} />
          }>
          {!filter && <PendingInvites />}
          {visible.length === 0 ? (
            <EmptyState
              icon="folder"
              title={filter ? 'Nessun progetto trovato' : 'Nessun progetto'}
              message={filter ? undefined : 'Crea il primo progetto con il pulsante +.'}
            />
          ) : (
            <Section
              header={
                summary.data && !filter
                  ? `${plural(summary.data.projectCount, 'progetto', 'progetti')} · ${summary.data.fileCount} file`
                  : `${plural(visible.length, 'progetto', 'progetti')}`
              }>
              {visible.map((p) => (
                <EntryRow
                  key={p.name}
                  entry={{ kind: 'folder', path: p.name, name: p.title, access: p.access, fileCount: p.fileCount, folderCount: 0, updatedAt: p.updatedAt }}
                  icon={<IconWell name={projectIcons[p.icon]} {...wellColors(p, t)} />}
                  subtitle={`${p.fileCount} file · ${relativeTime(p.updatedAt)}`}
                  right={p.team ? <Pill>{p.team.name}</Pill> : undefined}>
                  {p.checklist && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <ProgressBar value={p.checklist.done / p.checklist.total} style={{ flex: 1 }} />
                      <Text style={{ fontSize: 10.5, fontWeight: '600', color: t.textMuted }}>
                        {p.checklist.done}/{p.checklist.total}
                      </Text>
                    </View>
                  )}
                </EntryRow>
              ))}
            </Section>
          )}

          {!filter && !!recent.data?.length && (
            <Section header="Recenti">
              {recent.data.map((r) => (
                <Cell
                  key={r.path}
                  icon={<IconWell name={r.role === 'index' ? 'index' : r.role === 'checklist' ? 'checklist' : 'doc'} />}
                  title={r.name}
                  mono
                  subtitle={projectLabel(r.project)}
                  chevron
                  onPress={() => router.push(routes.file(r.path))}
                />
              ))}
            </Section>
          )}
        </Screen>
      )}
    </>
  );
}
