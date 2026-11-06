import { Alert } from 'react-native';

import { kb } from '@/api';
import { pickFiles, pickFolder } from '@/lib/pick-files';
import { attempt } from './hooks';
import { createSignal, invalidate } from './store';
import { createUploadQueue, type UploadItem } from './upload-queue';

export type { UploadItem };

const rows = createSignal<UploadItem[]>([]);

const queue = createUploadQueue({
  upload: (path, source, onProgress, signal) => kb.uploadFile(path, source, onProgress, signal),
  listPaths: (folder) => kb.listPaths(folder),
  finish: () => kb.finishUploads(),
  onChange: (items) => rows.set(items),
  // A finished file is in the mirror already: refetching the folder shows it where the gray row was.
  onSettled: () => invalidate(),
});

/** The uploads going into this folder, oldest first. */
export function useUploads(folder: string): UploadItem[] {
  return rows.useValue().filter((u) => u.parent === folder);
}

export const retryUpload = queue.retry;
export const dismissUpload = queue.dismiss;
export const resetUploads = queue.reset;

function reportSkipped(skipped: { name: string; reason: string }[]) {
  if (!skipped.length) return;
  const shown = skipped.slice(0, 6).map((s) => `• ${s.name}: ${s.reason}`);
  if (skipped.length > shown.length) shown.push(`…e altri ${skipped.length - shown.length}`);
  Alert.alert(skipped.length === 1 ? 'Un file non è stato caricato' : `${skipped.length} file non sono stati caricati`, shown.join('\n'));
}

/** "Carica file…": the system picker, then the chosen files go up into `folder` one row each. */
export async function uploadFilesInto(folder: string) {
  const picked = await attempt(() => pickFiles(), 'Impossibile aprire la selezione file');
  if (!picked?.length) return;
  const skipped = await attempt(() => queue.enqueue(folder, picked));
  if (skipped) reportSkipped(skipped);
}

/** "Carica cartella…": the system picker, then the whole folder goes up into `folder` as one row. */
export async function uploadFolderInto(folder: string) {
  const picked = await attempt(() => pickFolder(), 'Impossibile aprire la selezione cartella');
  if (!picked) return;
  if (!picked.files.length) {
    Alert.alert('Cartella vuota', `“${picked.name}” non contiene file da caricare.`);
    return;
  }
  const skipped = await attempt(() => queue.enqueue(folder, picked.files, picked.name));
  if (skipped) reportSkipped(skipped);
}
