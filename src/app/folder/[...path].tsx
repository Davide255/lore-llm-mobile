import { router, Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl, View } from 'react-native';

import { chooseTeamForProject, confirmDelete } from '@/components/entry-actions';
import { EntryRow } from '@/components/entry-row';
import { BottomAction, HeaderItems, type MenuItem } from '@/components/header-items';
import { Icon } from '@/components/icon';
import { Banner, EmptyState, ErrorState, IconWell, Loading, Screen, Section } from '@/components/ui';
import { useFolder, useProject } from '@/data/hooks';
import { relativeTime } from '@/lib/format';
import { projectLabel, projectOf, teamOf } from '@/lib/paths';
import { pathParam, routes } from '@/lib/routes';
import { ROLE_LABEL, canWrite } from '@/lib/teams';
import { useTheme } from '@/theme';

/** A2 — Project / folder contents. */
export default function FolderScreen() {
  const t = useTheme();
  const path = pathParam(useLocalSearchParams<{ path: string[] }>().path);
  const folder = useFolder(path);
  const data = folder.data;
  const isRoot = !path.includes('/');
  const name = isRoot ? projectLabel(path) : (path.split('/').pop() ?? '');
  const project = useProject(projectOf(path)).data;
  // Until the folder has loaded we do not know the role: offer nothing rather than something the server would refuse.
  const writable = !!data && canWrite(data.access);
  const readOnly = !!data && !writable;

  const create: MenuItem[] = [
    { label: 'Nuovo file .md', icon: 'noteAdd', onPress: () => router.push(routes.newFile(path, 'file')) },
    { label: 'Nuova cartella', icon: 'createFolder', onPress: () => router.push(routes.newFile(path, 'folder')) },
    { label: 'Incolla markdown', icon: 'paste', onPress: () => router.push(routes.newFile(path, 'paste')) },
  ];
  const more: MenuItem[] = [
    { label: 'Rinomina', icon: 'rename', onPress: () => router.push(routes.rename(path, true)) },
    ...(isRoot ? [] : [{ label: 'Sposta in…', icon: 'move' as const, onPress: () => router.push(routes.move(path, true)) }]),
    ...(isRoot && !teamOf(path)
      ? [{ label: 'Sposta in un team…', icon: 'team' as const, onPress: () => chooseTeamForProject(path, (key) => router.replace(routes.folder(key))) }]
      : []),
    {
      label: isRoot ? 'Elimina progetto' : 'Elimina cartella',
      icon: 'delete',
      destructive: true,
      onPress: () =>
        confirmDelete(
          { kind: 'folder', path, name, fileCount: (data?.files.length ?? 0) + (data?.folders.reduce((n, f) => n + f.fileCount, 0) ?? 0) },
          () => router.back(),
        ),
    },
  ];

  const empty = data && !data.folders.length && !data.files.length;

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <HeaderItems right={writable ? [{ kind: 'menu', label: 'Altro', icon: 'more', items: more }] : []} />
      {folder.loading ? (
        <Loading />
      ) : folder.error || !data ? (
        <ErrorState error={folder.error} onRetry={folder.refresh} />
      ) : (
        <Screen
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={folder.refreshing} onRefresh={folder.refresh} />}>
          {(project?.team && isRoot) || readOnly ? (
            <Banner icon={readOnly ? 'lock' : 'team'} tone="neutral" style={{ marginBottom: 8 }}>
              {project?.team && isRoot ? `Team ${project.team.name} · ${ROLE_LABEL[data.access]}. ` : ''}
              {readOnly ? 'Puoi leggere ma non modificare.' : 'Le modifiche sono visibili a tutto il team.'}
            </Banner>
          ) : null}
          {(data.index || data.checklist) && (
            <Section style={{ marginTop: 6 }}>
              {data.index && (
                <EntryRow
                  entry={data.index}
                  icon={<IconWell name="index" background={t.infoWell} color={t.info} />}
                  subtitle="Generato · sola lettura"
                  right={<Icon name="lock" size={13} color={t.textMuted} />}
                />
              )}
              {data.checklist && (
                <EntryRow
                  entry={data.checklist}
                  icon={<IconWell name="checklist" background={t.accentWell} />}
                  subtitle={`${data.checklist.progress.done} di ${data.checklist.progress.total} · ${relativeTime(data.checklist.updatedAt)}`}
                />
              )}
            </Section>
          )}

          <Section header="Cartelle">
            {data.folders.map((f) => (
              <EntryRow key={f.path} entry={f} />
            ))}
          </Section>

          <Section header="File">
            {data.files.map((f) => (
              <EntryRow key={f.path} entry={f} />
            ))}
          </Section>

          {empty && <EmptyState icon="doc" title="Cartella vuota" message="Usa + per creare un file o una cartella." />}

          <View style={{ marginTop: 18, gap: 10 }}>
            {!empty && (
              <Banner icon="swipe" tone="neutral">
                Scorri una riga per rinominare o eliminare, tieni premuto per altre azioni. index.md non si modifica.
              </Banner>
            )}
          </View>
        </Screen>
      )}
      {/* Last child so the Android FAB paints above the list. */}
      {writable && <BottomAction item={{ kind: 'menu', label: 'Crea', icon: 'add', title: `Crea in ${name}/`, items: create }} />}
    </>
  );
}
