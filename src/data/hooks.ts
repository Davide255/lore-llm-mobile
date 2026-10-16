import { Alert } from 'react-native';

import {
  KBError,
  kb,
  type AgentPatch,
  type CreateAgentInput,
  type CreateFileInput,
  type CreateProjectInput,
  type FileDocument,
  type Project,
} from '@/api';
import { toggleTaskAtLine } from '@/lib/markdown';
import { invalidate, setQueryData, useQuery } from './store';

// ─── Queries ─────────────────────────────────────────────────────────────────

export const useSummary = () => useQuery('summary', () => kb.getSummary());
export const useProjects = () => useQuery('projects', () => kb.listProjects());
export const useProject = (name: string) => useQuery(`project:${name}`, () => kb.getProject(name));
export const useFolder = (path: string) => useQuery(`folder:${path}`, () => kb.listFolder(path));
export const useFolderTree = (project: string | null) =>
  useQuery(project ? `tree:${project}` : null, () => kb.listFolderTree(project!));
export const useFile = (path: string) => useQuery(`file:${path}`, () => kb.getFile(path));
export const useRecentFiles = (limit = 5) => useQuery(`recent-files:${limit}`, () => kb.listRecentFiles(limit));
export const useRecentSearches = () => useQuery('recent-searches', () => kb.listRecentSearches());
export const useSearch = (query: string, project: string | null) =>
  useQuery(query.trim() ? `search:${project ?? '*'}:${query.trim().toLowerCase()}` : null, () =>
    kb.search(query, project),
  );
export const useAgents = () => useQuery('agents', () => kb.listAgents());
export const useAgent = (id: string) => useQuery(id ? `agent:${id}` : null, () => kb.getAgent(id));
export const useActivity = () => useQuery('activity', () => kb.listActivity());
export const useChange = (id: string) => useQuery(`change:${id}`, () => kb.getChange(id));
export const useSettings = () => useQuery('settings', () => kb.getSettings());

// ─── Background changes (agent writes) ──────────────────────────────────────

kb.subscribe((e) => {
  if (e.type === 'changed') invalidate();
});

// ─── Mutations ───────────────────────────────────────────────────────────────

async function mutate<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    invalidate();
  }
}

export const actions = {
  writeFile: (path: string, content: string, baseVersion?: string) =>
    mutate(() => kb.writeFile(path, content, baseVersion)),

  /** Optimistically flips a checkbox and writes the file back. */
  async toggleTask(doc: FileDocument, line: number) {
    const content = toggleTaskAtLine(doc.content, line);
    setQueryData<FileDocument>(`file:${doc.path}`, (prev) => ({ ...(prev ?? doc), content }));
    return mutate(() => kb.writeFile(doc.path, content));
  },

  createFile: (input: CreateFileInput) => mutate(() => kb.createFile(input)),
  createFolder: (parent: string, name: string) => mutate(() => kb.createFolder(parent, name)),
  createProject: (input: CreateProjectInput) => mutate(() => kb.createProject(input)),
  updateProject: (name: string, patch: Partial<Pick<Project, 'description' | 'icon'>>) =>
    mutate(() => kb.updateProject(name, patch)),
  rename: (path: string, newName: string) => mutate(() => kb.rename(path, newName)),
  move: (path: string, target: string) => mutate(() => kb.move(path, target)),
  duplicate: (path: string) => mutate(() => kb.duplicate(path)),
  remove: (path: string) => mutate(() => kb.remove(path)),
  undoRemove: (token: string) => mutate(() => kb.undoRemove(token)),

  markOpened: (path: string) => kb.markOpened(path).then(() => invalidate((k) => k.startsWith('recent-files'))),
  addRecentSearch: (q: string) => kb.addRecentSearch(q).then(() => invalidate((k) => k === 'recent-searches')),
  removeRecentSearch: (q: string) => {
    setQueryData<string[]>('recent-searches', (prev) => (prev ?? []).filter((x) => x !== q));
    return kb.removeRecentSearch(q);
  },

  createAgent: (input: CreateAgentInput) => mutate(() => kb.createAgent(input)),
  updateAgent: (id: string, patch: AgentPatch) => mutate(() => kb.updateAgent(id, patch)),
  revokeAgent: (id: string) => mutate(() => kb.revokeAgent(id)),
  revertChange: (id: string) => mutate(() => kb.revertChange(id)),

  sync: () => mutate(() => kb.sync()),
  deleteAccount: () => kb.deleteAccount(),
};

/** Runs an action and surfaces failures with a system alert. */
export async function attempt<T>(fn: () => Promise<T>, title = 'Operazione non riuscita'): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    Alert.alert(title, e instanceof KBError || e instanceof Error ? e.message : String(e));
    return undefined;
  }
}
