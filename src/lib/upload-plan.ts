/**
 * Uploading from the device: which picked files go up and under what name. The rules are the
 * desktop app's (`electron/upload.cjs`) and mirror what the Worker accepts: notes up to 1 MB and
 * attachments of these types up to 10 MB.
 */

export const ATTACHMENT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'] as const;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_NOTE_BYTES = 1024 * 1024;
const MAX_PATH = 512;
const MAX_SEGMENT = 128;
/** One pick of a folder goes up in one go: a bigger tree would take forever and fill the list with rows. */
export const MAX_FILES = 500;

export const UNSUPPORTED_TYPE = 'Tipo non supportato (ammessi: immagini PNG, JPG, GIF, WebP, SVG, PDF e note .md)';

export function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 1 ? '' : name.slice(dot + 1).toLowerCase();
}

export const isAttachment = (name: string) => (ATTACHMENT_EXTENSIONS as readonly string[]).includes(extOf(name));

/** What an attachment is, for its icon and preview; null for notes. */
export function attachmentKind(name: string): 'image' | 'pdf' | null {
  if (!isAttachment(name)) return null;
  return extOf(name) === 'pdf' ? 'pdf' : 'image';
}

/** Image types the app can draw itself (SVG cannot be drawn by the platform image view). */
export const isPreviewableImage = (name: string) => ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extOf(name));

/** A file name the server accepts: no folders, no leading dots, no control characters. */
export function cleanName(name: string): string {
  return String(name)
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f:*?"<>|]/g, '')
    .trim()
    .replace(/^\.+/, '');
}

/** `photo.png` taken -> `photo 2.png`, `photo 3.png`, … */
export function uniqueName(dir: string, name: string, exists: (rel: string) => boolean): string {
  if (!exists(`${dir}/${name}`)) return name;
  const dot = name.lastIndexOf('.');
  const stem = name.slice(0, dot);
  const ext = name.slice(dot);
  for (let n = 2; ; n++) if (!exists(`${dir}/${stem} ${n}${ext}`)) return `${stem} ${n}${ext}`;
}

export interface UploadCandidate {
  name: string;
  size: number;
  /** The folder the file sits in inside a folder being uploaded ("photos/2024"), kept under the target. */
  dir?: string;
  /** A reason already known (a file that could not be read). */
  skip?: string;
}

export interface PlannedUpload {
  /** Position in the candidates, to find the picked file again. */
  index: number;
  name: string;
  /** Full path in the knowledge base. */
  rel: string;
  kind: 'note' | 'attachment';
}

export interface UploadPlan {
  ok: PlannedUpload[];
  skipped: { name: string; reason: string }[];
}

/**
 * Decides, for each candidate, whether it goes up and where. `exists(rel)` says whether a path is
 * taken (planned files count too, so two `a.png` in one batch become `a.png` and `a 2.png`).
 */
export function planUpload(target: string, files: UploadCandidate[], exists: (rel: string) => boolean): UploadPlan {
  const taken = new Set<string>();
  const isTaken = (rel: string) => taken.has(rel) || exists(rel);
  const ok: PlannedUpload[] = [];
  const skipped: UploadPlan['skipped'] = [];

  files.forEach((f, index) => {
    const shown = f.dir ? `${f.dir}/${f.name}` : f.name;
    const sub = f.dir ? f.dir.split(/[\\/]/).filter(Boolean) : [];
    // Hidden files and folders (.git, .DS_Store) are noise in a folder, not something to report.
    if (sub.some((s) => s.startsWith('.')) || (sub.length && f.name.startsWith('.'))) return;
    const folders = sub.map(cleanName);
    const clean = cleanName(f.name);
    const ext = extOf(clean);
    if (f.skip) return void skipped.push({ name: shown, reason: f.skip });
    if (!clean || !ext || folders.some((s) => !s)) return void skipped.push({ name: shown, reason: 'Nome non valido' });
    const note = ext === 'md';
    if (!note && !isAttachment(clean)) return void skipped.push({ name: shown, reason: UNSUPPORTED_TYPE });
    if (!(f.size > 0)) return void skipped.push({ name: shown, reason: 'File vuoto' });
    if (f.size > (note ? MAX_NOTE_BYTES : MAX_ATTACHMENT_BYTES)) {
      return void skipped.push({ name: shown, reason: note ? 'Più grande di 1 MB' : 'Più grande di 10 MB' });
    }
    if (ok.length >= MAX_FILES) return void skipped.push({ name: shown, reason: `Oltre il limite di ${MAX_FILES} file per caricamento` });
    const parent = [target, ...folders].join('/');
    const name = uniqueName(parent, clean, isTaken);
    const rel = `${parent}/${name}`;
    if ([...folders, name].some((s) => s.length > MAX_SEGMENT) || rel.length > MAX_PATH) {
      return void skipped.push({ name: shown, reason: 'Nome troppo lungo' });
    }
    taken.add(rel);
    ok.push({ index, name, rel, kind: note ? 'note' : 'attachment' });
  });

  return { ok, skipped };
}

/** Percentage 0–100 of a transfer; an unknown total counts as 0. */
export function percent(sent: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(100, Math.floor((sent / total) * 100))) : 0;
}
