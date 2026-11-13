import { router } from 'expo-router';
import { Alert, Share } from 'react-native';

import type { MenuItem } from './header-items';
import { showToast } from './toast';
import { kb, type Entry } from '@/api';
import { actions, attempt } from '@/data/hooks';
import { isProjectRoot } from '@/lib/paths';
import { routes } from '@/lib/routes';
import { isAttachment } from '@/lib/upload-plan';
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
        // Attachments are not kept on the device, so there is nothing to put back.
        if (!receipt.undoable) {
          showToast({ icon: 'delete', subject: entry.name, message: 'eliminato' });
          return;
        }
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
 * Moves one of the user's own projects into a team they can write to: a bottom sheet asks which
 * team and confirms. Afterwards the project belongs to the team and every member sees it.
 */
export function chooseTeamForProject(project: string, reopen = false) {
  router.push(routes.moveToTeam(project, reopen));
}

/** Star or unstar a note; a failure is shown as an alert. */
export function starItem(path: string, starred: boolean): MenuItem {
  return {
    label: starred ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti',
    icon: starred ? 'starFill' : 'star',
    onPress: () => void attempt(() => actions.setStar(path, !starred), 'Impossibile aggiornare i preferiti'),
  };
}

/** Actions for the long-press menu (E2). `role` gates what special files allow; viewers only read. */
export function entryMenu(entry: Entry, starred = false): MenuItem[] {
  const isFile = entry.kind === 'file';
  const special = isFile && entry.role !== 'doc';
  const attachment = isFile && isAttachment(entry.name);
  const readOnly = !canWrite(entry.access);
  const items: MenuItem[] = [{ label: 'Apri', icon: 'open', onPress: () => router.push(routes.entry(entry.path, entry.kind)) }];
  if (isFile && !attachment && entry.role !== 'index' && !readOnly) items.push({ label: 'Modifica', icon: 'edit', onPress: () => router.push(routes.edit(entry.path)) });
  if (!special && !readOnly) {
    // The rename screen enforces the slug rule for notes; an uploaded file keeps the name it came with.
    if (!attachment) items.push({ label: 'Rinomina', icon: 'rename', onPress: () => router.push(routes.rename(entry.path)) });
    if (!isProjectRoot(entry.path)) {
      items.push({ label: 'Sposta in…', icon: 'move', onPress: () => router.push(routes.move(entry.path)) });
    }
  }
  if (isFile && !special && !attachment && !readOnly) items.push({ label: 'Duplica', icon: 'duplicate', onPress: () => duplicateEntry(entry.path) });
  if (isFile && !attachment && entry.role !== 'index') items.push(starItem(entry.path, starred));
  if (isFile && !attachment) items.push({ label: 'Condividi', icon: 'share', onPress: () => shareEntry(entry.path, entry.name) });
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
