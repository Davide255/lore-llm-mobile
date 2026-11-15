import { Directory, File, Paths } from 'expo-file-system';

/**
 * Where the images and PDFs the user opened are kept between launches, so they can be seen
 * again without a connection (and without downloading them twice). One folder per user in the
 * document directory, one sub-folder per version of an attachment, named after its path and
 * etag: a changed file gets a new folder and the old one is dropped. Kept apart so the client's
 * tests can swap it for a fake.
 */
export interface BlobStore {
  /** The device URI of the saved copy: that exact version when `etag` is given, whichever version is saved when it is null. */
  find(userId: string, path: string, etag: string | null): Promise<string | null>;
  /** Download the attachment and keep it (older versions of the same path are dropped); resolves with its device URI. */
  save(userId: string, path: string, etag: string, url: string, headers: Record<string, string>): Promise<string>;
  /** Everything saved for the user (sign-out, account deletion). */
  clear(userId: string): Promise<void>;
}

/** Small stable hash, to tell paths apart whatever characters they hold. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

const safe = (text: string) => text.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48);

/** Folder-name prefix shared by every version of one attachment. */
export const pathKey = (path: string) => `${hash(path)}-`;
/** Folder name of one version of one attachment. */
export const versionKey = (path: string, etag: string) => `${pathKey(path)}${safe(etag)}-${hash(etag)}`;

const baseName = (path: string) => path.split('/').pop() || 'file';

const userDir = (userId: string) => new Directory(Paths.document, `lore-files-${safe(userId)}`);

function entries(dir: Directory) {
  try {
    return dir.exists ? dir.list() : [];
  } catch {
    return [];
  }
}

function drop(entry: Directory | File) {
  try {
    if (entry.exists) entry.delete();
  } catch {
    // Already gone.
  }
}

export const deviceBlobs: BlobStore = {
  async find(userId, path, etag) {
    const dir = userDir(userId);
    const name = baseName(path);
    if (etag) {
      const file = new File(dir, versionKey(path, etag), name);
      return file.exists ? file.uri : null;
    }
    for (const e of entries(dir)) {
      if (!(e instanceof Directory) || !e.name.startsWith(pathKey(path))) continue;
      const file = new File(e, name);
      if (file.exists) return file.uri;
    }
    return null;
  },

  async save(userId, path, etag, url, headers) {
    const dir = userDir(userId);
    dir.create({ intermediates: true, idempotent: true });
    const key = versionKey(path, etag);
    const target = new Directory(dir, key);
    target.create({ intermediates: true, idempotent: true });
    try {
      const file = await File.downloadFileAsync(url, new File(target, baseName(path)), { headers, idempotent: true });
      for (const e of entries(dir)) {
        if (e instanceof Directory && e.name.startsWith(pathKey(path)) && e.name !== key) drop(e);
      }
      return file.uri;
    } catch (err) {
      drop(target);
      throw err;
    }
  },

  async clear(userId) {
    drop(userDir(userId));
  },
};
