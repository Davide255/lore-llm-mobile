import type { Href } from 'expo-router';

import { splitPath } from './paths';

/** Central place for building hrefs to KB entries (catch-all routes). */
export const routes = {
  folder: (path: string) => ({ pathname: '/folder/[...path]', params: { path: splitPath(path) } }) as unknown as Href,
  /** `heading`: scroll to the heading with this text once the file is shown. */
  file: (path: string, heading?: string | null) =>
    ({ pathname: '/file/[...path]', params: { path: splitPath(path), ...(heading ? { heading } : {}) } }) as unknown as Href,
  attachment: (path: string) => ({ pathname: '/attachment/[...path]', params: { path: splitPath(path) } }) as unknown as Href,
  edit: (path: string) => ({ pathname: '/edit/[...path]', params: { path: splitPath(path) } }) as unknown as Href,
  entry: (path: string, kind: 'file' | 'folder') => (kind === 'file' ? routes.file(path) : routes.folder(path)),
  newFile: (parent: string, kind: 'file' | 'folder' | 'paste' = 'file') =>
    ({ pathname: '/new-file', params: { parent, kind } }) as unknown as Href,
  newProject: () => '/new-project' as Href,
  /** `reopen`: the caller is showing `path` and must follow it to its new location. */
  rename: (path: string, reopen = false) =>
    ({ pathname: '/rename', params: { path, ...(reopen ? { reopen: '1' } : {}) } }) as unknown as Href,
  move: (path: string, reopen = false) =>
    ({ pathname: '/move', params: { path, ...(reopen ? { reopen: '1' } : {}) } }) as unknown as Href,
  change: (id: string) => ({ pathname: '/change/[id]', params: { id } }) as unknown as Href,
  agent: (id: string) => ({ pathname: '/agent/[id]', params: { id } }) as unknown as Href,
  connectAgent: () => '/connect-agent' as Href,
  team: (id: string) => ({ pathname: '/team/[id]', params: { id } }) as unknown as Href,
  newTeam: () => '/new-team' as Href,
  inviteMember: (teamId: string) => ({ pathname: '/invite-member', params: { teamId } }) as unknown as Href,
};

/** Catch-all params arrive as string[] (native) or a single string (web). */
export function pathParam(p: string | string[] | undefined): string {
  if (!p) return '';
  return (Array.isArray(p) ? p : p.split('/')).map((s) => decodeURIComponent(s)).join('/');
}
