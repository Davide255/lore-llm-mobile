import { router } from 'expo-router';
import { Alert, Share } from 'react-native';

import { showActionSheet } from './action-sheet';
import type { MenuItem } from './header-items';
import { showToast } from './toast';
import { kb, type Entry } from '@/api';
import { actions, attempt } from '@/data/hooks';
import { isProjectRoot, projectLabel, teamProjectKey } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { canWrite } from '@/lib/teams';

export function confirmDelete(entry: Pick<Entry, 'path' | 'name' | 'kind'> & { fileCount?: number }, onDeleted?: () => void) {
  const isFolder = entry.kind === 'folder';
  const title = isFolder ? (isProjectRoot(entry.path) ? 'Eliminare il progetto?' : 'Eliminare la cartella?') : 'Eliminare il file?';
  const message = isFolder
    ? `${entry.name} e ${entry.fileCount === 1 ? 'il file contenuto' : `i ${entry.fileCount ?? 0} file contenuti`} verranno rimossi dalla base e dal contesto degli agenti.`
    : `${entry.name} verrà rimosso dalla base e dal contesto degli agenti.`;
  Alert.alert(title, message, [
    { text: 'Annulla', style: 'cancel' },
    {
      text: 'Elimina',
      style: 'destructive',
      onPress: async () => {
        const receipt = await attempt(() => actions.remove(entry.path), 'Eliminazione non riuscita');
        if (!receipt) return;
        onDeleted?.();
        showToast({
          icon: 'delete',
          subject: entry.name,
          message: 'eliminato',
          actionLabel: 'Annulla',
          duration: new Date(receipt.undoUntil).getTime() - Date.now(),
          onAction: () => attempt(() => actions.undoRemove(receipt.token), 'Ripristino non riuscito'),
        });
      },
    },
  ]);
}

export async function shareEntry(path: string, name: string) {
  const doc = await attempt(() => kb.getFile(path));
  if (doc) Share.share({ title: name, message: doc.content });
}

export async function duplicateEntry(path: string) {
  const target = await attempt(() => actions.duplicate(path));
  if (target) showToast({ icon: 'duplicate', subject: target.split('/').pop(), message: 'creato' });
}

/**
 * Moves one of the user's own projects into a team they can write to. Asks which team,
 * then confirms: afterwards the project belongs to the team and every member sees it.
 */
export async function chooseTeamForProject(project: string, onMoved?: (newKey: string) => void) {
  const teams = await attempt(() => kb.listTeams(), 'Impossibile caricare i team');
  if (!teams) return;
  const writable = teams.filter((t) => canWrite(t.role));
  if (!writable.length) {
    Alert.alert('Nessun team', 'Crea un team in Impostazioni, oppure fatti dare il ruolo di editor in un team esistente.');
    return;
  }
  const label = projectLabel(project);
  showActionSheet({
    title: `Sposta “${label}” in un team`,
    message: 'Il progetto diventa del team: i membri lo vedono in base al loro ruolo.',
    options: writable.map((team) => ({
      label: team.name,
      icon: 'team' as const,
      onPress: () =>
        Alert.alert(`Spostare “${label}” in ${team.name}?`, 'Non sarà più solo tuo: lo gestirà il team. Gli agenti collegati al tuo account non lo vedranno più.', [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Sposta',
            onPress: async () => {
              const ok = await attempt(() => actions.moveProjectToTeam(project, team.id).then(() => true), 'Impossibile spostare il progetto');
              if (!ok) return;
              showToast({ icon: 'team', subject: label, message: `ora è di ${team.name}` });
              onMoved?.(teamProjectKey(project, team.id));
            },
          },
        ]),
    })),
  });
}

/** Actions for the long-press menu (E2). `role` gates what special files allow; viewers only read. */
export function entryMenu(entry: Entry): MenuItem[] {
  const isFile = entry.kind === 'file';
  const special = isFile && entry.role !== 'doc';
  const readOnly = !canWrite(entry.access);
  const items: MenuItem[] = [{ label: 'Apri', icon: 'open', onPress: () => router.push(routes.entry(entry.path, entry.kind)) }];
  if (isFile && entry.role !== 'index' && !readOnly) items.push({ label: 'Modifica', icon: 'edit', onPress: () => router.push(routes.edit(entry.path)) });
  if (!special && !readOnly) {
    items.push({ label: 'Rinomina', icon: 'rename', onPress: () => router.push(routes.rename(entry.path)) });
    if (!isProjectRoot(entry.path)) {
      items.push({ label: 'Sposta in…', icon: 'move', onPress: () => router.push(routes.move(entry.path)) });
    }
  }
  if (isFile && !special && !readOnly) items.push({ label: 'Duplica', icon: 'duplicate', onPress: () => duplicateEntry(entry.path) });
  if (isFile) items.push({ label: 'Condividi', icon: 'share', onPress: () => shareEntry(entry.path, entry.name) });
  if (!readOnly && !(isFile && entry.role === 'index')) {
    items.push({
      label: 'Elimina',
      icon: 'delete',
      destructive: true,
      onPress: () => confirmDelete({ ...entry, fileCount: entry.kind === 'folder' ? entry.fileCount : undefined }),
    });
  }
  return items;
}
