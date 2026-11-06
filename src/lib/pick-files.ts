import { Directory, File } from 'expo-file-system';

import { walkFolder, type PickedFile } from './folder-walk';

/** The system pickers. Both resolve with null when the user backs out. */

export async function pickFiles(): Promise<PickedFile[] | null> {
  const res = await File.pickFileAsync({ multipleFiles: true });
  if (res.canceled) return null;
  return res.result.map((f) => ({ name: f.name, uri: f.uri, size: f.size }));
}

export async function pickFolder(): Promise<{ name: string; files: PickedFile[] } | null> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch (e) {
    // The picker has no "canceled" result: backing out comes as a rejection.
    if (/cancel|dismiss|abort/i.test(`${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? ''}`)) return null;
    throw e;
  }
  return { name: dir.name, files: walkFolder(dir) };
}
