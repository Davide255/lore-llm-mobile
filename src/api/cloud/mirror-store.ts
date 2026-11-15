import { File, Paths } from 'expo-file-system';

/**
 * Where the mirror of the user's notes (project list, file listings, note contents) is kept
 * between launches, so the app can be opened and read without a connection. One file per
 * user in the document directory: AsyncStorage is capped at about 6 MB on Android, which a
 * few hundred notes can exceed. Kept apart so the client's tests can swap it for a fake.
 */
export interface MirrorStore {
  /** The saved snapshot as JSON text, or null when there is none (or it cannot be read). */
  load(userId: string): Promise<string | null>;
  save(userId: string, json: string): Promise<void>;
  remove(userId: string): Promise<void>;
}

// Account ids are Cognito subs (uuids), but the name must be safe whatever they are.
const fileOf = (userId: string) => new File(Paths.document, `lore-mirror-${userId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);

export const deviceMirror: MirrorStore = {
  async load(userId) {
    try {
      const file = fileOf(userId);
      return file.exists ? await file.text() : null;
    } catch {
      return null;
    }
  },
  async save(userId, json) {
    const file = fileOf(userId);
    if (!file.exists) file.create();
    file.write(json);
  },
  async remove(userId) {
    try {
      const file = fileOf(userId);
      if (file.exists) file.delete();
    } catch {
      // Nothing to remove, or already gone.
    }
  },
};
