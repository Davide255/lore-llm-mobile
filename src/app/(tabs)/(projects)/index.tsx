import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import type { Project } from '@/api';
import { EntryRow } from '@/components/entry-row';
import { HeaderItems } from '@/components/header-items';
import { PendingInvites } from '@/components/invites';
import { ProjectGrid } from '@/components/project-card';
import { Icon, projectIcons } from '@/components/icon';
import { Cell, EmptyState, ErrorState, IconWell, Loading, Pill, ProgressBar, Screen, Section, SectionHeader } from '@/components/ui';
import { actions, attempt, useMyInvites, useProjects, useRecentFiles, useStars, useSummary } from '@/data/hooks';
import { plural, relativeTime } from '@/lib/format';
import { basename, projectLabel } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { useTheme, type Theme } from '@/theme';
import { useSplitLayout } from '@/theme/layout';

/** Accent wells for the brand-coloured project icons (A1). */
function wellColors(p: Project, t: Theme) {
  if (p.icon === 'fitness') return { background: t.accentWell, color: t.accentText };
  if (p.icon === 'web') return { background: t.folderWell, color: t.folder };
  return {};
}

function StarButton({ path, label, starred }: { path: string; label: string; starred: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => attempt(() => actions.setStar(path, !starred), 'Impossibile aggiornare i preferiti')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={starred ? `Rimuovi ${label} dai preferiti` : `Aggiungi ${label} ai preferiti`}>
      <Icon name={starred ? 'starFill' : 'star'} size={18} color={starred ? t.warning : t.textMuted} />
    </Pressable>
  );
}

/** Reminds that the project belongs to a team (shown next to the star). */
function TeamBadge({ name }: { name: string }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={`Progetto del team ${name}`}>
      <Icon name="team" size={18} color={t.textMuted} />
    </View>
  );
}

/** A1 — Projects. */
export default function ProjectsScreen() {
  const t = useTheme();
  const projects = useProjects();
  const summary = useSummary();
  const recent = useRecentFiles(3);
  const invites = useMyInvites();
  const stars = useStars();
  const [filter, setFilter] = useState('');
  // Tablet: the desktop app's grid of project cards, starred first.
  const split = useSplitLayout();

  const starredProjects = new Set((stars.data ?? []).filter((s) => s.kind === 'project').map((s) => s.path));
  const visible = (projects.data ?? []).filter((p) => p.title.toLowerCase().includes(filter.trim().toLowerCase()));
  const favorites = visible.filter((p) => starredProjects.has(p.name));
  const others = visible.filter((p) => !starredProjects.has(p.name));
  // Starred notes of projects the user can no longer see are left out.
  const known = new Set((projects.data ?? []).map((p) => p.name));
  const starredNotes = (stars.data ?? []).filter((s) => s.kind === 'note' && known.has(s.path.split('/')[0]!) && !filter);

  const projectRow = (p: Project, starred: boolean) => (
    <EntryRow
      key={p.name}
      entry={{ kind: 'folder', path: p.name, name: p.title, access: p.access, fileCount: p.fileCount, folderCount: 0, updatedAt: p.updatedAt }}
      icon={<IconWell name={projectIcons[p.icon]} {...wellColors(p, t)} />}
      subtitle={`${p.fileCount} file · ${relativeTime(p.updatedAt)}`}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {p.team && <Pill>{p.team.name}</Pill>}
          {p.team && <TeamBadge name={p.team.name} />}
          <StarButton path={p.name} label={p.title} starred={starred} />
        </View>
      }>
      {p.checklist && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <ProgressBar value={p.checklist.done / p.checklist.total} style={{ flex: 1 }} />
          <Text style={{ fontSize: 10.5, fontWeight: '600', color: t.textMuted }}>
            {p.checklist.done}/{p.checklist.total}
          </Text>
        </View>
      )}
    </EntryRow>
  );

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
          wide={split}
          contentContainerStyle={split ? { maxWidth: 1120 } : undefined}
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
          ) : split ? (
            <>
              <SectionHeader>
                {summary.data && !filter
                  ? `${plural(summary.data.projectCount, 'progetto', 'progetti')} · ${summary.data.fileCount} file`
                  : plural(visible.length, 'progetto', 'progetti')}
              </SectionHeader>
              <ProjectGrid projects={[...favorites, ...others]} starred={starredProjects} />
            </>
          ) : (
            <>
              {favorites.length > 0 && <Section header="Preferiti">{favorites.map((p) => projectRow(p, true))}</Section>}
              {others.length > 0 && (
                <Section
                  header={
                    favorites.length > 0
                      ? 'Progetti'
                      : summary.data && !filter
                        ? `${plural(summary.data.projectCount, 'progetto', 'progetti')} · ${summary.data.fileCount} file`
                        : `${plural(visible.length, 'progetto', 'progetti')}`
                  }>
                  {others.map((p) => projectRow(p, false))}
                </Section>
              )}
            </>
          )}

          {starredNotes.length > 0 && (
            <Section header="Note preferite">
              {starredNotes.map((n) => (
                <Cell
                  key={n.path}
                  icon={<IconWell name="doc" />}
                  title={basename(n.path)}
                  mono
                  subtitle={projectLabel(n.path)}
                  chevron
                  onPress={() => router.push(routes.file(n.path))}
                  right={<StarButton path={n.path} label={basename(n.path)} starred />}
                />
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
