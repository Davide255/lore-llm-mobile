export const INDEX_FILE = 'index.md';
export const CHECKLIST_FILE = 'checklist.md';

export function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

export function joinPath(...parts: (string | undefined | null)[]): string {
  return parts
    .filter((p): p is string => !!p)
    .flatMap(splitPath)
    .join('/');
}

export function basename(path: string): string {
  const parts = splitPath(path);
  return parts[parts.length - 1] ?? '';
}

export function dirname(path: string): string {
  return splitPath(path).slice(0, -1).join('/');
}

export function projectOf(path: string): string {
  return splitPath(path)[0] ?? '';
}

export function isProjectRoot(path: string): boolean {
  return splitPath(path).length === 1;
}

export function roleOf(path: string): 'index' | 'checklist' | 'doc' {
  const parts = splitPath(path);
  if (parts.length === 2 && parts[1] === INDEX_FILE) return 'index';
  if (parts.length === 2 && parts[1] === CHECKLIST_FILE) return 'checklist';
  return 'doc';
}

/** Resolve a markdown link target relative to the folder of `fromFile`. */
export function resolveLink(fromFile: string, target: string): string | null {
  if (/^[a-z]+:/i.test(target) || target.startsWith('#')) return null;
  const clean = decodeURIComponent(target.split('#')[0]);
  const base = clean.startsWith('/') ? [] : splitPath(dirname(fromFile));
  for (const part of splitPath(clean)) {
    if (part === '.') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  return base.join('/');
}

/**
 * The file a `[[wiki link]]` target points to among the project's `files`: a name
 * (`notes`) or a path (`plans/notes`), with or without `.md`, in any case, or as the
 * slug the server would give it. Like Obsidian, a bare name matches in any folder;
 * ties go to the file closest to `fromFile`, then the shortest path.
 */
export function resolveWikiTarget(fromFile: string, target: string, files: string[]): string | null {
  const names = new Set<string>();
  for (const raw of [target, target.split('/').map(slugify).join('/')]) {
    const n = splitPath(raw).join('/').toLowerCase();
    if (n) names.add(n);
  }
  const project = projectOf(fromFile);
  const from = splitPath(dirname(fromFile));
  const closeness = (p: string) => {
    const dir = splitPath(dirname(p));
    let i = 0;
    while (i < dir.length && i < from.length && dir[i] === from[i]) i++;
    return i;
  };
  const matches = files.filter((p) => {
    if (projectOf(p) !== project) return false;
    const key = p.toLowerCase();
    return [...names].some((n) => [n, `${n}.md`].some((c) => key === `${project.toLowerCase()}/${c}` || key.endsWith(`/${c}`)));
  });
  matches.sort((a, b) => closeness(b) - closeness(a) || splitPath(a).length - splitPath(b).length || a.localeCompare(b));
  return matches[0] ?? null;
}

const FILE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/** File/folder names: lowercase and dashes, no spaces (per design C2). */
export function validateSlug(name: string): string | null {
  if (!name) return 'Inserisci un nome.';
  if (!FILE_NAME_RE.test(name)) return 'Solo minuscole, numeri e trattini.';
  return null;
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ─── Team projects ───────────────────────────────────────────────────────────
// The first path segment is the project. A team's project is addressed by the key
// `Name@<teamId>`: the Worker's project names cannot contain "@", so a key never
// clashes with a personal project, and everything built on "first segment = project"
// (routes, folders, caches) works unchanged. Only the client talks to the server in
// terms of (owner, path); `toWire` / `fromWire` are the one translation.

const TEAM_SEP = '@';

export function teamProjectKey(name: string, teamId: string): string {
  return `${name}${TEAM_SEP}${teamId}`;
}

export function parseProjectKey(key: string): { name: string; teamId: string | null } {
  const i = key.lastIndexOf(TEAM_SEP);
  return i <= 0 ? { name: key, teamId: null } : { name: key.slice(0, i), teamId: key.slice(i + 1) };
}

/** The team a path belongs to, or null for the user's own space. */
export function teamOf(path: string): string | null {
  return parseProjectKey(projectOf(path)).teamId;
}

/** The project's display name, without the team suffix. */
export function projectLabel(path: string): string {
  return parseProjectKey(projectOf(path)).name;
}

/** A client path as the server sees it: the owner (`t:<teamId>`, or null for the user's own space) and the plain path. */
export function toWire(path: string): { owner: string | null; path: string } {
  const [first = '', ...rest] = splitPath(path);
  const { name, teamId } = parseProjectKey(first);
  return { owner: teamId ? `t:${teamId}` : null, path: [name, ...rest].join('/') };
}

/** A server path of a team (or the user's own space, `teamId` null) as a client path. */
export function fromWire(teamId: string | null, path: string): string {
  const [first = '', ...rest] = splitPath(path);
  return [teamId ? teamProjectKey(first, teamId) : first, ...rest].join('/');
}
