/** Narrowest window that still gets the sidebar (an iPad in portrait is 744–1032pt wide). */
const SPLIT_MIN_WIDTH = 700;
/** A phone's short side stays under this, even a Pro Max in landscape. */
const TABLET_MIN_SIDE = 600;

/** Whether a window of this size is a tablet wide enough for the desktop layout. */
export function isSplitLayout(width: number, height: number): boolean {
  return Math.min(width, height) >= TABLET_MIN_SIDE && width >= SPLIT_MIN_WIDTH;
}

export type SidebarSection = 'projects' | 'study' | 'activity' | 'settings';

/** What the sidebar highlights for a pathname: a section, and the file or folder shown, if any. */
export function sidebarSelection(pathname: string): { section: SidebarSection | null; path: string | null } {
  const segments = pathname.split('/').filter(Boolean).map(safeDecode);
  const [head, ...rest] = segments;
  if (head === 'folder' || head === 'file' || head === 'attachment' || head === 'edit') {
    return { section: 'projects', path: rest.join('/') || null };
  }
  if (!head) return { section: 'projects', path: null };
  if (head === 'study' || head === 'study-setup' || head === 'study-session') return { section: 'study', path: null };
  if (head === 'activity' || head === 'change') return { section: 'activity', path: null };
  if (head === 'settings' || head === 'agent' || head === 'team') return { section: 'settings', path: null };
  return { section: null, path: null };
}

/** The folders that contain `path`, outermost first (`a/b/c.md` → `a`, `a/b`). */
export function ancestors(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
