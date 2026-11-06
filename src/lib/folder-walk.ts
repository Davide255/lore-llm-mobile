import type { UploadCandidate } from './upload-plan';

/** What the walk needs from a file or folder on the device (expo-file-system's `File` and `Directory`). */
export interface WalkFile {
  name: string;
  uri: string;
  size: number;
}
export interface WalkDir {
  name: string;
  list(): (WalkFile | WalkDir)[];
}

/** A file picked from the device, ready for `planUpload`. */
export interface PickedFile extends UploadCandidate {
  uri: string;
}

// A folder with more files than this is not something to upload from a phone: stop reading it.
export const MAX_WALK = 5000;

const isDir = (e: WalkFile | WalkDir): e is WalkDir => typeof (e as WalkDir).list === 'function';

/**
 * Every file under a folder, each with its `dir` inside the folder (the folder's own name first, so the
 * folder itself is what appears at the target). Hidden entries are not entered; unreadable folders are
 * left out; reading stops at MAX_WALK files.
 */
export function walkFolder(root: WalkDir): PickedFile[] {
  const out: PickedFile[] = [];
  const visit = (dir: WalkDir, rel: string) => {
    let entries: (WalkFile | WalkDir)[];
    try {
      entries = dir.list();
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= MAX_WALK) return;
      if (e.name.startsWith('.')) continue;
      if (isDir(e)) visit(e, `${rel}/${e.name}`);
      else out.push({ name: e.name, uri: e.uri, size: e.size, dir: rel });
    }
  };
  visit(root, root.name);
  return out;
}
