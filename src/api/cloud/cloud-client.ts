import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import type { KnowledgeBaseClient, ServerEvent } from '../client';
import {
  KBError,
  type ActivityEvent,
  type Agent,
  type AgentPatch,
  type AgentRef,
  type Change,
  type CreateAgentInput,
  type CreateFileInput,
  type CreateProjectInput,
  type DeleteReceipt,
  type FileDocument,
  type FileEntry,
  type FolderEntry,
  type FolderListing,
  type InviteRole,
  type KBSettings,
  type MyInvite,
  type NewAgent,
  type Project,
  type ProjectIcon,
  type SearchHit,
  type SearchResponse,
  type Team,
  type TeamInvite,
  type TeamMember,
  type TeamRole,
} from '../types';
import {
  applyAudit,
  refOf,
  toAgentFields,
  toPatch,
  writtenByAgent,
  type AgentKind,
  type AgentRow,
  type AuditRow,
  type Writer,
} from './agents';
import { idToken } from '@/auth/session';
import { diffLines, diffStats } from '@/lib/diff';
import { checklistProgress, parse, plainText } from '@/lib/markdown';
import {
  CHECKLIST_FILE,
  basename,
  dirname,
  fromWire,
  joinPath,
  parseProjectKey,
  projectLabel,
  projectOf,
  roleOf,
  splitPath,
  teamOf,
  teamProjectKey,
  toWire,
} from '@/lib/paths';

/**
 * The knowledge base in the user's cloud space (R2 behind the lore-llm
 * Worker). Launch loads the project list and each project's checklist
 * (`/v1/projects`); a project's files are mirrored (`/v1/files?project=`,
 * contents refetched only when the etag changes) the first time it is opened.
 * Empty folders and project metadata live on the device — object storage has
 * neither — and a cheap `/v1/version` poll tells when to look at the audit log
 * to pick up agent writes, keeping a diff of each one it sees happen.
 *
 * Team projects live in the teams' own spaces on the server. Here they are
 * ordinary projects whose key carries the team (`Name@<teamId>`, see
 * `lib/paths.ts`); `fileRequest` is where a key becomes (owner, path).
 */

export const API_URL = (process.env.EXPO_PUBLIC_LORE_API_URL ?? 'https://lore-llm-dev.davide-bera2021.workers.dev').replace(/\/+$/, '');

const MCP_URL = `${API_URL}/mcp`;

// How often agent writes are looked for (one cheap audit query) while the app is in the foreground.
const POLL_MS = 10_000;
// How far back the audit log is read to attribute existing files.
const AUDIT_WINDOW = 200;
const UNDO_WINDOW_MS = 10_000;

interface FileVersion {
  path: string;
  size: number;
  uploaded: string;
  etag: string;
}

/** One row of `GET /v1/projects`: what the project list needs without opening the project. */
interface ProjectSummary {
  name: string;
  /** Notes, without the generated index. */
  file_count: number;
  size: number;
  /** Newest note; empty when the project has none. */
  updated_at: string;
  checklist: { path: string; etag: string; size: number; uploaded: string } | null;
  /** Set client-side: the team the project belongs to (null: the user's own). */
  teamId?: string | null;
}

/** Team rows as the Worker sends them. */
interface TeamRow {
  id: string;
  name: string;
  role: TeamRole;
  created_at: string;
}
interface TeamInviteRow {
  id: string;
  email: string;
  role: InviteRole;
  created_at: string;
  expires_at: string;
}

type FileChange = { path: string; before: string | null; after: string | null };

/** Per-user state kept on the device. */
interface Persisted {
  /** path → etag of the version this app wrote (so it isn't mistaken for an agent's). */
  authors: Record<string, string>;
  /** Folders without files yet. */
  folders: string[];
  projects: Record<string, { description: string; icon: ProjectIcon }>;
  /** id → identity of every agent ever seen, so revoked ones keep their name. */
  agentRefs: Record<string, { name: string; kind: AgentKind }>;
  /** Diffs of agent changes the app saw happen, keyed by change id. */
  changes: Record<string, Change>;
  recentFiles: { path: string; openedAt: string }[];
  recentSearches: string[];
  lastLogId: number;
  lastSyncAt: string | null;
}

const emptyState = (): Persisted => ({
  authors: {},
  folders: [],
  projects: {},
  agentRefs: {},
  changes: {},
  recentFiles: [],
  recentSearches: [],
  lastLogId: 0,
  lastSyncAt: null,
});

interface PendingDelete {
  path: string;
  kind: 'file' | 'folder';
  contents: Record<string, string>;
  folders: string[];
  project?: { name: string; meta: Persisted['projects'][string] };
}

const iso = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);
const under = (p: string, prefix: string) => p === prefix || p.startsWith(prefix + '/');
const changeId = (logId: number) => `c${logId}`;

// Server messages are English; the UI is Italian.
function toError(status: number, error: string | undefined): KBError {
  if (status === 401) return new KBError('invalid', 'Sessione non valida: esci e accedi di nuovo');
  if (status === 403) return new KBError('read_only', 'Non hai i permessi per farlo');
  if (status === 404) return new KBError('not_found', 'Elemento non trovato');
  if (status === 429) return new KBError('invalid', 'Troppi inviti in sospeso');
  // Team rules answer 409 too: tell them apart from a stale file by the server's message.
  if (/only owner of a team/i.test(error ?? '')) {
    return new KBError('invalid', 'Sei l’unico proprietario di un team: nomina un altro proprietario o elimina il team, poi riprova');
  }
  if (/at least one owner/i.test(error ?? '')) return new KBError('invalid', 'Serve almeno un proprietario: nomina prima un altro proprietario');
  if (/already a member/i.test(error ?? '')) return new KBError('exists', 'Questa persona è già nel team');
  if (/already pending/i.test(error ?? '')) return new KBError('exists', 'Esiste già un invito per questa email');
  if (/still has files/i.test(error ?? '')) return new KBError('invalid', 'Il team ha ancora dei file: spostali o eliminali prima');
  if (/team limit/i.test(error ?? '')) return new KBError('invalid', 'Hai raggiunto il numero massimo di team');
  if (/valid email/i.test(error ?? '')) return new KBError('invalid', 'Inserisci un’email valida');
  if (status === 409) return new KBError('conflict', 'Il file è stato modificato da un agente nel frattempo: ricarica e riprova');
  if (/already exists/i.test(error ?? '')) return new KBError('exists', 'Esiste già un elemento con questo nome');
  if (/index\.md/i.test(error ?? '')) return new KBError('read_only', 'index.md è generato automaticamente');
  if (/too large/i.test(error ?? '')) return new KBError('invalid', 'File o cartella troppo grande');
  return new KBError('invalid', error || `Errore del server (${status})`);
}

/** First prose paragraph of a generated index.md: skips headings, banners, lists, quotes, code, tables. */
function indexSummary(content = '') {
  const para = content
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .find((b) => b && !/^(#|_|\*[^*]|-|\d+\.|\[|>|```|\|)/.test(b));
  return para ? para.replace(/\s+/g, ' ').replace(/[*_`]/g, '').slice(0, 160) : '';
}

export class CloudKnowledgeBaseClient implements KnowledgeBaseClient {
  private userId: string | null = null;
  private state: Persisted = emptyState();
  /** Files of the projects that were opened, plus the checklist of every project. */
  private files = new Map<string, FileVersion>();
  private summaries = new Map<string, ProjectSummary>();
  /** The teams the user belongs to (role included). */
  private teams: Team[] = [];
  /** Projects whose files are mirrored (opened at least once this session). */
  private loaded = new Set<string>();
  private loading = new Map<string, Promise<void>>();
  /** Server change cursor at the last sync: while it is unchanged there is nothing to fetch. */
  private version: string | null = null;
  private cache = new Map<string, { etag: string; content: string }>();
  private writers = new Map<string, Writer>();
  private audit: AuditRow[] = [];
  private primed: Promise<void> | null = null;
  private reconciling: Promise<string[]> | null = null;
  private pendingDeletes = new Map<string, PendingDelete>();
  private listeners = new Set<(e: ServerEvent) => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    setInterval(() => this.poll(), POLL_MS);
    // Coming back to the app: look for agent writes right away.
    AppState.addEventListener('change', (s) => s === 'active' && this.poll());
  }

  // ─── session ──────────────────────────────────────────────────────────────

  /** Switch to the signed-in user's space (null on sign-out). */
  async setUser(id: string | null) {
    if (id === this.userId) return;
    this.userId = id;
    this.state = emptyState();
    this.files = new Map();
    this.summaries = new Map();
    this.teams = [];
    this.loaded = new Set();
    this.loading = new Map();
    this.version = null;
    this.cache = new Map();
    this.writers = new Map();
    this.audit = [];
    this.primed = null;
    this.pendingDeletes.clear();
    if (!id) return;
    try {
      const raw = await AsyncStorage.getItem(this.storageKey());
      if (raw && this.userId === id) this.state = { ...emptyState(), ...(JSON.parse(raw) as Persisted) };
    } catch {
      // Unreadable: start over, the server has the files.
    }
  }

  private storageKey() {
    return `lore.cloud.v1:${this.userId}`;
  }

  private persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (!this.userId) return;
    const key = this.storageKey();
    const state = this.state;
    this.saveTimer = setTimeout(() => {
      AsyncStorage.setItem(key, JSON.stringify(state)).catch(() => {});
    }, 300);
  }

  subscribe(listener: (e: ServerEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(e: ServerEvent) {
    this.listeners.forEach((l) => l(e));
  }

  // ─── HTTP ─────────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    route: string,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const token = await idToken();
    if (!token) throw new KBError('invalid', 'Accesso richiesto');
    const params = Object.entries(opts.query ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    let res: Response;
    try {
      res = await fetch(`${API_URL}${route}${params ? `?${params}` : ''}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      throw new KBError('network', 'Server Lore non raggiungibile');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw toError(res.status, (data as { error?: string }).error);
    return data as T;
  }

  /** A call about a file or folder: the owner of the path (a team, or the user) travels as `?owner=`. */
  private fileRequest<T>(
    method: string,
    route: string,
    path: string,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const w = toWire(path);
    return this.request<T>(method, route, { ...opts, query: { ...opts.query, path: w.path, ...(w.owner ? { owner: w.owner } : {}) } });
  }

  private roleIn(path: string): TeamRole {
    const teamId = teamOf(path);
    return teamId ? (this.teams.find((t) => t.id === teamId)?.role ?? 'viewer') : 'owner';
  }

  /** Viewers read only: say so before a write is attempted (the server enforces it too). */
  private assertCanWrite(path: string) {
    if (this.roleIn(path) === 'viewer') throw new KBError('read_only', 'Hai accesso in sola lettura a questo team');
  }

  // ─── mirror ───────────────────────────────────────────────────────────────

  /** Download the contents of the files whose cached etag differs, recording them in `into`. */
  private async fetchStale(list: FileVersion[], into: Map<string, FileVersion>): Promise<FileChange[]> {
    const changes: FileChange[] = [];
    const queue = list.filter((f) => this.cache.get(f.path)?.etag !== f.etag);
    await Promise.all(
      Array.from({ length: Math.min(6, queue.length) }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          const before = this.cache.get(f.path)?.content ?? null;
          try {
            const got = await this.fileRequest<FileVersion & { content: string }>('GET', '/v1/file', f.path);
            this.cache.set(f.path, { etag: got.etag, content: got.content });
            into.set(f.path, { path: f.path, size: got.size, uploaded: got.uploaded, etag: got.etag });
            changes.push({ path: f.path, before, after: got.content });
          } catch {
            into.delete(f.path); // deleted between list and get
          }
        }
      }),
    );
    return changes;
  }

  /** Forget a project that is gone from the server. */
  private dropProject(name: string, changes: FileChange[]) {
    for (const path of [...this.files.keys(), ...this.cache.keys()]) {
      if (!under(path, name)) continue;
      const c = this.cache.get(path);
      if (c) changes.push({ path, before: c.content, after: null });
      this.cache.delete(path);
      this.files.delete(path);
    }
    this.loaded.delete(name);
    this.summaries.delete(name);
  }

  /**
   * The project list and every project's checklist: one listing plus the checklists
   * that changed. Projects that were opened keep their checklist up to date through
   * `syncProject`.
   */
  private async syncSummaries(): Promise<FileChange[]> {
    const { teams } = await this.request<{ teams: TeamRow[] }>('GET', '/v1/teams');
    this.teams = teams.map((t) => this.toTeam(t));
    // The user's own space plus each team's: a space that cannot be read right now (just left) counts as empty.
    const spaces = [null, ...this.teams.map((t) => t.id)];
    const lists = await Promise.all(
      spaces.map(async (teamId) => {
        try {
          const { projects } = await this.request<{ projects: ProjectSummary[] }>('GET', '/v1/projects', {
            query: teamId ? { owner: `t:${teamId}` } : {},
          });
          return projects.map((p) => ({
            ...p,
            teamId,
            name: teamId ? teamProjectKey(p.name, teamId) : p.name,
            checklist: p.checklist && { ...p.checklist, path: fromWire(teamId, p.checklist.path) },
          }));
        } catch (err) {
          if (teamId && err instanceof KBError && (err.code === 'not_found' || err.code === 'read_only')) return [];
          throw err;
        }
      }),
    );
    const projects = lists.flat();
    const changes: FileChange[] = [];
    const next = new Map(projects.map((p) => [p.name, p]));
    for (const name of [...this.summaries.keys()]) if (!next.has(name)) this.dropProject(name, changes);
    this.summaries = next;

    const checklists: FileVersion[] = [];
    for (const p of projects) {
      if (this.loaded.has(p.name)) continue;
      const path = joinPath(p.name, CHECKLIST_FILE);
      if (p.checklist) {
        const meta = { path: p.checklist.path, size: p.checklist.size, uploaded: p.checklist.uploaded, etag: p.checklist.etag };
        this.files.set(meta.path, meta);
        checklists.push(meta);
      } else {
        this.files.delete(path);
        const c = this.cache.get(path);
        if (c) changes.push({ path, before: c.content, after: null });
        this.cache.delete(path);
      }
    }
    changes.push(...(await this.fetchStale(checklists, this.files)));
    return changes;
  }

  /** Re-list one project and pull changed contents. Returns what changed. */
  private async syncProject(project: string): Promise<FileChange[]> {
    const { name, teamId } = parseProjectKey(project);
    const { files: wire } = await this.request<{ files: FileVersion[] }>('GET', '/v1/files', {
      query: { project: name, ...(teamId ? { owner: `t:${teamId}` } : {}) },
    });
    const list = wire.map((f) => ({ ...f, path: fromWire(teamId, f.path) }));
    const next = new Map(list.map((f) => [f.path, f]));
    const changes = await this.fetchStale(list, next);
    for (const path of [...this.files.keys(), ...this.cache.keys()]) {
      if (!under(path, project) || next.has(path)) continue;
      const c = this.cache.get(path);
      if (c) changes.push({ path, before: c.content, after: null });
      this.cache.delete(path);
      this.files.delete(path);
    }
    for (const [path, f] of next) this.files.set(path, f);
    this.loaded.add(project);
    // Folders that now have files no longer need to be remembered.
    this.state.folders = this.state.folders.filter((f) => projectOf(f) !== project || ![...next.keys()].some((p) => under(p, f)));
    return changes;
  }

  /** Mirror a project's files the first time it is needed (opening it, changing it). */
  private loadProject(project: string): Promise<void> {
    if (!project || this.loaded.has(project)) return Promise.resolve();
    let pending = this.loading.get(project);
    if (!pending) {
      pending = (async () => {
        await this.ready();
        // Unknown names (a project not created yet) have nothing to load.
        if (!this.loaded.has(project) && this.projectNames().includes(project)) await this.syncProject(project);
      })().finally(() => this.loading.delete(project));
      this.loading.set(project, pending);
    }
    return pending;
  }

  private async loadProjects(...paths: string[]) {
    await Promise.all([...new Set(paths.map(projectOf))].map((p) => this.loadProject(p)));
  }

  private async refreshAgents(): Promise<AgentRow[]> {
    const { agents } = await this.request<{ agents: AgentRow[] }>('GET', '/v1/agents');
    for (const a of agents) this.state.agentRefs[a.agent_id] = { name: a.name, kind: toAgentFields(a).kind };
    this.persist();
    return agents;
  }

  /** The server's change cursor (the user's own space and each team's), or null when it cannot say (then every poll syncs). */
  private async serverVersion(): Promise<string | null> {
    try {
      const v = await this.request<{ version: number; scopes?: Record<string, { version: number }> }>('GET', '/v1/version');
      const scopes = Object.entries(v.scopes ?? {})
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, s]) => `${k}=${s.version}`);
      return [v.version, ...scopes].join(',');
    } catch (err) {
      if (err instanceof KBError && err.code === 'network') throw err;
      return null;
    }
  }

  private ready() {
    this.primed ??= (async () => {
      // The cursor is read first: a change made while syncing shows up at the next poll.
      const version = await this.serverVersion();
      await this.syncSummaries();
      const [{ items }] = await Promise.all([
        this.request<{ items: AuditRow[] }>('GET', '/v1/audit', { query: { limit: AUDIT_WINDOW } }),
        this.refreshAgents(),
      ]);
      this.audit = items;
      this.writers = new Map();
      applyAudit(this.writers, items);
      this.state.lastLogId = items[0]?.log_id ?? 0;
      this.version = version;
      this.state.lastSyncAt = iso();
      this.persist();
    })().catch((err) => {
      this.primed = null;
      throw err;
    });
    return this.primed;
  }

  /**
   * Pick up what changed on the server: new audit rows (agent writes), then
   * the files. A change with a matching new audit row is the agent's and is
   * kept with its diff; anything else came from the user's other apps.
   */
  private reconcile(force = false): Promise<string[]> {
    const run = async () => {
      const version = await this.serverVersion();
      if (!force && version !== null && version === this.version) return [];
      const { items } = await this.request<{ items: AuditRow[] }>('GET', '/v1/audit', { query: { limit: 50 } });
      const after = this.state.lastLogId;
      const fresh = items.filter((r) => r.log_id > after);
      if (fresh.length) {
        this.audit = [...fresh, ...this.audit.filter((r) => r.log_id <= after)].slice(0, AUDIT_WINDOW);
        this.state.lastLogId = applyAudit(this.writers, fresh, after);
        // An agent created elsewhere (another device): learn its identity first.
        if (fresh.some((r) => !this.state.agentRefs[r.agent_id])) await this.refreshAgents().catch(() => {});
      }
      const changes = await this.syncSummaries();
      for (const project of [...this.loaded]) changes.push(...(await this.syncProject(project)));
      this.version = version;
      for (const ch of changes) {
        if (roleOf(ch.path) === 'index' || this.state.authors[ch.path] === this.files.get(ch.path)?.etag) continue;
        const row = fresh.find((r) => r.target_path === ch.path); // newest first
        if (row) this.recordChange(row, ch.before, ch.after);
      }
      this.state.lastSyncAt = iso();
      this.persist();
      return changes.map((c) => c.path);
    };
    // One at a time; a call made meanwhile runs again afterwards.
    const next: Promise<string[]> = (this.reconciling ?? Promise.resolve([])).catch(() => []).then(run);
    this.reconciling = next;
    next.finally(() => {
      if (this.reconciling === next) this.reconciling = null;
    }).catch(() => {});
    return next;
  }

  private async poll() {
    if (!this.userId || !this.primed || this.reconciling || AppState.currentState !== 'active') return;
    try {
      await this.primed;
      const paths = await this.reconcile();
      if (paths.length) this.emit({ type: 'changed', paths });
    } catch {
      // Offline or session gone: try again next tick.
    }
  }

  private recordChange(row: AuditRow, before: string | null, after: string | null) {
    if (before === after) return;
    const stats = diffStats(diffLines(before ?? '', after ?? ''));
    const id = changeId(row.log_id);
    this.state.changes[id] = {
      id,
      agent: refOf(this.state.agentRefs, row.agent_id),
      path: row.target_path,
      project: projectOf(row.target_path),
      at: row.timestamp,
      before,
      after,
      ...stats,
      restorable: true,
    };
    // Keep the most recent diffs only.
    const ids = Object.keys(this.state.changes).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
    for (const old of ids.slice(150)) delete this.state.changes[old];
  }

  /** After the app's own writes: the server recompiled index.md, so pull it. */
  private async afterWrite() {
    // Forced: the cursor bump on the server is best effort, and index.md must be pulled.
    await this.reconcile(true).catch(() => {});
  }

  private adoptOwn(path: string, file: FileVersion, content: string) {
    this.cache.set(path, { etag: file.etag, content });
    this.files.set(path, file);
    this.state.authors[path] = file.etag;
    this.persist();
  }

  // ─── tree ─────────────────────────────────────────────────────────────────

  private authorOf(path: string): { author: 'you' | 'agent'; agent?: AgentRef } {
    const f = this.files.get(path);
    if (!f || this.state.authors[path] === f.etag) return { author: 'you' };
    const w = this.writers.get(path);
    if (!writtenByAgent(f.uploaded, w)) return { author: 'you' };
    return { author: 'agent', agent: refOf(this.state.agentRefs, w!.agentId) };
  }

  /** Every folder: parents of files plus the remembered empty ones. */
  private allFolders(): Set<string> {
    const out = new Set<string>();
    const add = (p: string) => {
      const parts = splitPath(p);
      for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'));
    };
    for (const p of this.files.keys()) add(dirname(p));
    this.state.folders.forEach(add);
    Object.keys(this.state.projects).forEach(add);
    for (const name of this.summaries.keys()) add(name);
    return out;
  }

  private filesUnder(path: string) {
    return [...this.files.keys()].filter((p) => under(p, path));
  }

  private exists(path: string) {
    return this.files.has(path) || this.allFolders().has(path);
  }

  private fileEntry(f: FileVersion): FileEntry {
    return {
      kind: 'file',
      path: f.path,
      name: basename(f.path),
      access: this.roleIn(f.path),
      role: roleOf(f.path),
      size: f.size,
      updatedAt: f.uploaded,
      ...this.authorOf(f.path),
    };
  }

  private folderEntry(path: string, folders: Set<string>): FolderEntry {
    const files = this.filesUnder(path).map((p) => this.files.get(p)!);
    const updatedAt = files.reduce((max, f) => (f.uploaded > max ? f.uploaded : max), '');
    return {
      kind: 'folder',
      path,
      name: path.includes('/') ? basename(path) : projectLabel(path),
      access: this.roleIn(path),
      fileCount: files.length,
      folderCount: [...folders].filter((f) => dirname(f) === path).length,
      updatedAt: updatedAt || iso(),
    };
  }

  private toProject(name: string): Project {
    // Opened projects are counted from their files; the others from the project list.
    const summary = this.summaries.get(name);
    const files = this.filesUnder(name)
      .filter((p) => roleOf(p) !== 'index')
      .map((p) => this.files.get(p)!);
    const opened = this.loaded.has(name);
    const checklist = this.cache.get(joinPath(name, CHECKLIST_FILE));
    const progress = checklist ? checklistProgress(checklist.content) : null;
    const meta = this.state.projects[name];
    const { name: title, teamId } = parseProjectKey(name);
    const team = teamId ? this.teams.find((t) => t.id === teamId) : undefined;
    return {
      name,
      title,
      team: team ? { id: team.id, name: team.name } : null,
      access: this.roleIn(name),
      description: meta?.description || indexSummary(this.cache.get(joinPath(name, 'index.md'))?.content),
      icon: meta?.icon ?? 'folder',
      fileCount: opened || !summary ? files.length : summary.file_count,
      // The compiled index doesn't count as user/agent activity.
      updatedAt: opened || !summary ? files.reduce((max, f) => (f.uploaded > max ? f.uploaded : max), '') : summary.updated_at,
      checklist: progress && progress.total > 0 ? progress : null,
    };
  }

  private projectNames() {
    return [...this.allFolders()].filter((f) => !f.includes('/'));
  }

  // ─── browse ───────────────────────────────────────────────────────────────

  async getSummary() {
    await this.ready();
    const projects = [...this.summaries.values()];
    return {
      projectCount: this.projectNames().length,
      fileCount: projects.reduce((n, p) => n + p.file_count, 0),
      totalBytes: projects.reduce((n, p) => n + p.size, 0),
    };
  }

  async listProjects() {
    await this.ready();
    return this.projectNames()
      .map((n) => this.toProject(n))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }

  async getProject(name: string) {
    await this.ready();
    if (!this.allFolders().has(name)) throw new KBError('not_found', `Progetto "${name}" non trovato`);
    return this.toProject(name);
  }

  async listFolder(path: string): Promise<FolderListing> {
    await this.loadProjects(path);
    const folders = this.allFolders();
    if (!folders.has(path)) throw new KBError('not_found', `Cartella "${path}" non trovata`);
    const root = splitPath(path).length === 1;
    const files = [...this.files.values()].filter((f) => dirname(f.path) === path).map((f) => this.fileEntry(f));
    const index = root ? (files.find((f) => f.role === 'index') ?? null) : null;
    const checklistFile = root ? files.find((f) => f.role === 'checklist') : undefined;
    return {
      path,
      name: root ? projectLabel(path) : basename(path),
      project: projectOf(path),
      access: this.roleIn(path),
      isProjectRoot: root,
      index,
      checklist: checklistFile
        ? { ...checklistFile, progress: checklistProgress(this.cache.get(checklistFile.path)?.content ?? '') }
        : null,
      folders: [...folders]
        .filter((f) => dirname(f) === path)
        .map((f) => this.folderEntry(f, folders))
        .sort((a, b) => a.name.localeCompare(b.name)),
      files: files.filter((f) => f.role === 'doc').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  async listFolderTree(project: string) {
    await this.loadProjects(project);
    return [...this.allFolders()].filter((f) => projectOf(f) === project).sort();
  }

  async getFile(path: string): Promise<FileDocument> {
    await this.ready();
    const f = await this.fileRequest<FileVersion & { content: string }>('GET', '/v1/file', path);
    const cached = this.cache.get(path);
    // Opening a file is also a chance to notice an agent edit (and keep its diff).
    if (cached && cached.etag !== f.etag && this.state.authors[path] !== f.etag) {
      const paths = await this.reconcile().catch(() => []);
      if (paths.length) this.emit({ type: 'changed', paths });
    }
    this.cache.set(path, { etag: f.etag, content: f.content });
    this.files.set(path, { path, size: f.size, uploaded: f.uploaded, etag: f.etag });
    const role = roleOf(path);
    return {
      path,
      name: basename(path),
      project: projectOf(path),
      role,
      content: f.content,
      size: f.size,
      updatedAt: f.uploaded,
      version: f.etag,
      access: this.roleIn(path),
      ...this.authorOf(path),
      tokenCount: role === 'index' ? Math.round(f.content.length / 3.6) : undefined,
    };
  }

  async listRecentFiles(limit = 5) {
    await this.ready();
    return this.state.recentFiles
      // Files of projects that were not opened yet cannot be checked: keep them if their project exists.
      .filter((r) => (this.loaded.has(projectOf(r.path)) ? this.files.has(r.path) : this.projectNames().includes(projectOf(r.path))))
      .slice(0, limit)
      .map((r) => ({ ...r, name: basename(r.path), project: projectOf(r.path), role: roleOf(r.path) }));
  }

  async markOpened(path: string) {
    this.state.recentFiles = [{ path, openedAt: iso() }, ...this.state.recentFiles.filter((r) => r.path !== path)].slice(0, 20);
    this.persist();
  }

  // ─── write ────────────────────────────────────────────────────────────────

  private assertWritable(path: string) {
    if (roleOf(path) === 'index') throw new KBError('read_only', 'index.md è generato automaticamente');
    this.assertCanWrite(path);
  }

  private async put(path: string, content: string, opts: { overwrite: boolean; ifMatch?: string }) {
    this.assertCanWrite(path);
    const res = await this.fileRequest<{ file: FileVersion }>('PUT', '/v1/file', path, {
      body: { content, overwrite: opts.overwrite, ...(opts.ifMatch ? { if_match: opts.ifMatch } : {}) },
    });
    const file = { ...res.file, path };
    this.adoptOwn(path, file, content);
    return file;
  }

  async writeFile(path: string, content: string, baseVersion?: string) {
    await this.ready();
    this.assertWritable(path);
    await this.put(path, content, { overwrite: true, ifMatch: baseVersion ?? this.cache.get(path)?.etag });
    await this.afterWrite();
    return this.getFile(path);
  }

  async createFile({ parent, name, content }: CreateFileInput) {
    await this.ready();
    const path = joinPath(parent, name);
    if (!parent) throw new KBError('invalid', 'I file devono stare dentro un progetto');
    await this.loadProjects(parent);
    if (this.exists(path)) throw new KBError('exists', `"${name}" esiste già`);
    this.assertWritable(path);
    await this.put(path, content, { overwrite: false });
    await this.afterWrite();
    return this.getFile(path);
  }

  // Object storage has no empty folders: they live here until a file is put in them.
  async createFolder(parent: string, name: string) {
    await this.ready();
    const path = joinPath(parent, name);
    await this.loadProjects(path);
    if (this.exists(path)) throw new KBError('exists', `"${name}" esiste già`);
    this.state.folders.push(path);
    this.persist();
    return path;
  }

  async createProject({ name, description, icon, withChecklist }: CreateProjectInput) {
    await this.ready();
    const clean = name.trim();
    if (!clean || clean.includes('/') || clean.includes('@')) throw new KBError('invalid', 'Nome progetto non valido');
    if (this.exists(clean)) throw new KBError('exists', `Il progetto "${clean}" esiste già`);
    this.state.projects[clean] = { description: description.trim(), icon };
    this.state.folders.push(clean);
    this.persist();
    if (withChecklist) {
      await this.put(joinPath(clean, CHECKLIST_FILE), '## Da fare\n\n- [ ] Prima attività\n', { overwrite: false });
      await this.afterWrite();
    }
    return this.toProject(clean);
  }

  async updateProject(name: string, patch: Partial<Pick<Project, 'description' | 'icon'>>) {
    await this.ready();
    const current = this.toProject(name);
    this.state.projects[name] = { description: current.description, icon: current.icon, ...patch };
    this.persist();
    return this.toProject(name);
  }

  /** Files and folders under `from` move to `to` (R2 has no rename: the server copies). */
  private async relocate(from: string, to: string) {
    if (from === to) return to;
    if (teamOf(from) !== teamOf(to)) throw new KBError('invalid', 'Non puoi spostare file tra spazi diversi: per un progetto usa “Sposta nel team”');
    this.assertCanWrite(from);
    if (this.exists(to)) throw new KBError('exists', `"${basename(to)}" esiste già`);
    const moved = this.files.has(from) ? [from] : this.filesUnder(from);
    const mine = new Set(moved.filter((p) => this.authorOf(p).author === 'you'));
    if (moved.length) {
      const a = toWire(from);
      await this.request('POST', '/v1/files/move', { query: a.owner ? { owner: a.owner } : {}, body: { from: a.path, to: toWire(to).path } });
    }
    const re = (p: string) => (under(p, from) ? to + p.slice(from.length) : p);
    this.state.folders = this.state.folders.map(re);
    this.state.recentFiles = this.state.recentFiles.map((r) => ({ ...r, path: re(r.path) }));
    if (this.state.projects[from]) {
      this.state.projects[to] = this.state.projects[from];
      delete this.state.projects[from];
    }
    for (const p of moved) {
      // Carry content over so the move doesn't look like an agent edit.
      const c = this.cache.get(p);
      if (c) this.cache.set(re(p), c);
      this.cache.delete(p);
      delete this.state.authors[p];
    }
    // Re-mirror what the move touched; a renamed project's old name is gone.
    for (const project of new Set([projectOf(from), projectOf(to)])) await this.syncProject(project);
    if (!from.includes('/')) {
      this.loaded.delete(from);
      this.summaries.delete(from);
    }
    await this.syncSummaries();
    for (const p of mine) {
      const f = this.files.get(re(p));
      if (f) this.state.authors[re(p)] = f.etag;
    }
    this.persist();
    return to;
  }

  async rename(path: string, newName: string) {
    await this.loadProjects(path);
    if (this.files.has(path) && roleOf(path) !== 'doc') throw new KBError('read_only', 'I file speciali non si rinominano');
    if (!this.exists(path)) throw new KBError('not_found', 'Elemento non trovato');
    // A team project keeps its team in the key: renaming changes only the name before it.
    const teamId = teamOf(path);
    const target = !path.includes('/') && teamId ? teamProjectKey(newName, teamId) : joinPath(dirname(path), newName);
    return this.relocate(path, target);
  }

  async move(path: string, targetFolder: string) {
    await this.loadProjects(path, targetFolder);
    if (!this.allFolders().has(targetFolder)) throw new KBError('not_found', `Cartella "${targetFolder}" non trovata`);
    if (roleOf(path) !== 'doc') throw new KBError('read_only', 'I file speciali non si spostano');
    if (under(targetFolder, path)) throw new KBError('invalid', 'Non puoi spostare una cartella dentro sé stessa');
    return this.relocate(path, joinPath(targetFolder, basename(path)));
  }

  async duplicate(path: string) {
    await this.loadProjects(path);
    if (!this.files.has(path)) throw new KBError('not_found', 'File non trovato');
    const content = this.cache.get(path)?.content ?? (await this.getFile(path)).content;
    const stem = basename(path).replace(/\.md$/, '');
    let n = 1;
    let target = joinPath(dirname(path), `${stem}-copia.md`);
    while (this.exists(target)) target = joinPath(dirname(path), `${stem}-copia-${++n}.md`);
    await this.put(target, content, { overwrite: false });
    await this.afterWrite();
    return target;
  }

  // Delete = keep the contents in memory, remove on the server; undo writes them back.
  async remove(path: string): Promise<DeleteReceipt> {
    await this.loadProjects(path);
    this.assertWritable(path);
    const isFile = this.files.has(path);
    if (!isFile && !this.allFolders().has(path)) throw new KBError('not_found', 'Elemento non trovato');
    const affected = isFile ? [path] : this.filesUnder(path);
    const item: PendingDelete = {
      path,
      kind: isFile ? 'file' : 'folder',
      contents: Object.fromEntries(
        affected.filter((p) => roleOf(p) !== 'index').map((p) => [p, this.cache.get(p)?.content ?? '']),
      ),
      folders: isFile ? [] : [...this.allFolders()].filter((f) => under(f, path)),
    };
    this.assertCanWrite(path);
    if (isFile) await this.fileRequest('DELETE', '/v1/file', path);
    else if (affected.length) await this.fileRequest('DELETE', '/v1/folder', path);
    if (this.state.projects[path]) {
      item.project = { name: path, meta: this.state.projects[path] };
      delete this.state.projects[path];
    }
    this.state.folders = this.state.folders.filter((f) => !under(f, path));
    if (!path.includes('/')) {
      this.loaded.delete(path);
      this.summaries.delete(path);
    }
    for (const p of affected) {
      this.cache.delete(p);
      this.files.delete(p);
      delete this.state.authors[p];
    }
    this.persist();
    await this.afterWrite();
    const token = uid();
    this.pendingDeletes.set(token, item);
    setTimeout(() => this.pendingDeletes.delete(token), 60_000);
    return { token, path, kind: item.kind, undoUntil: new Date(Date.now() + UNDO_WINDOW_MS).toISOString() };
  }

  async undoRemove(token: string) {
    const d = this.pendingDeletes.get(token);
    if (!d) throw new KBError('not_found', 'Niente da ripristinare');
    this.pendingDeletes.delete(token);
    if (this.exists(d.path)) throw new KBError('exists', 'Un elemento con lo stesso nome è stato ricreato');
    for (const [p, content] of Object.entries(d.contents)) await this.put(p, content, { overwrite: false });
    // Empty folders come back as local folders.
    for (const f of d.folders) if (!this.state.folders.includes(f)) this.state.folders.push(f);
    if (d.project) this.state.projects[d.project.name] = d.project.meta;
    this.persist();
    await this.afterWrite();
  }

  // ─── search ───────────────────────────────────────────────────────────────

  async search(query: string, project?: string | null): Promise<SearchResponse> {
    await this.ready();
    // Search reads the mirrored text, so it is the one place that opens every project (or just the one asked for).
    for (const name of project ? [project] : this.projectNames()) await this.loadProject(name);
    const q = query.trim().toLowerCase();
    if (!q) return { query, totalMatches: 0, hits: [], byProject: [] };
    const count = (text: string) => {
      const lower = text.toLowerCase();
      let n = 0;
      for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, i + q.length)) n++;
      return n;
    };
    const all: (SearchHit & { matches: number; updatedAt: string })[] = [];
    for (const [path, { content }] of this.cache) {
      const lines = parse(content).flatMap((b) => ('text' in b ? (b.type === 'code' ? b.text.split('\n') : [plainText(b.text)]) : []));
      const matches = lines.reduce((n, l) => n + count(l), 0);
      if (!matches) continue;
      const snippet = makeSnippet(lines.find((l) => count(l) > 0)!, q);
      all.push({
        path,
        name: basename(path),
        project: projectOf(path),
        role: roleOf(path),
        snippet,
        extraMatches: matches - snippet.highlights.length,
        matches,
        updatedAt: this.files.get(path)?.uploaded ?? '',
      });
    }
    const byProject = new Map<string, number>();
    all.forEach((h) => byProject.set(h.project, (byProject.get(h.project) ?? 0) + h.matches));
    const hits = all.filter((h) => !project || h.project === project).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      query,
      totalMatches: hits.reduce((n, h) => n + h.matches, 0),
      hits: hits.map(({ matches: _m, updatedAt: _u, ...h }) => h),
      byProject: [...byProject.entries()].map(([p, matches]) => ({ project: p, matches })).sort((a, b) => b.matches - a.matches),
    };
  }

  async listRecentSearches() {
    return this.state.recentSearches;
  }

  async addRecentSearch(query: string) {
    const q = query.trim();
    if (!q) return;
    this.state.recentSearches = [q, ...this.state.recentSearches.filter((x) => x !== q)].slice(0, 8);
    this.persist();
  }

  async removeRecentSearch(query: string) {
    this.state.recentSearches = this.state.recentSearches.filter((x) => x !== query);
    this.persist();
  }

  // ─── agents ───────────────────────────────────────────────────────────────

  private toAgent(row: AgentRow): Agent {
    const fields = toAgentFields(row);
    return { ...fields, lastWriteAt: this.audit.find((r) => r.agent_id === fields.id)?.timestamp ?? null };
  }

  async listAgents() {
    await this.ready();
    return (await this.refreshAgents()).map((r) => this.toAgent(r));
  }

  async getAgent(id: string) {
    const agent = (await this.listAgents()).find((a) => a.id === id);
    if (!agent) throw new KBError('not_found', 'Agente non trovato');
    return agent;
  }

  async createAgent({ kind, name, permission, scope }: CreateAgentInput): Promise<NewAgent> {
    const res = await this.request<{ agent: AgentRow; token: string; expires_at: string }>('POST', '/v1/agents', {
      body: { name, ...toPatch({ kind, permission, scope }) },
    });
    const agent = this.toAgent(res.agent);
    this.state.agentRefs[agent.id] = { name: agent.name, kind: agent.kind };
    this.persist();
    return { agent, token: res.token, expiresAt: res.expires_at, mcpUrl: MCP_URL };
  }

  async updateAgent(id: string, patch: AgentPatch) {
    await this.request('PATCH', `/v1/agents/${encodeURIComponent(id)}`, { body: toPatch(patch) });
    return this.getAgent(id);
  }

  async revokeAgent(id: string) {
    await this.request('DELETE', `/v1/agents/${encodeURIComponent(id)}`);
  }

  async listActivity(): Promise<ActivityEvent[]> {
    await this.ready();
    await this.reconcile().catch(() => {});
    const kinds = { CREATE: 'create', UPDATE: 'write', DELETE: 'delete' } as const;
    return this.audit.map((r) => {
      const change = this.state.changes[changeId(r.log_id)];
      return {
        id: `a${r.log_id}`,
        agent: refOf(this.state.agentRefs, r.agent_id),
        kind: kinds[r.action],
        project: projectOf(r.target_path),
        path: r.target_path,
        at: r.timestamp,
        added: change?.added,
        removed: change?.removed,
        changeId: change?.id,
      };
    });
  }

  async getChange(id: string): Promise<Change> {
    await this.ready();
    const c = this.state.changes[id];
    if (!c) throw new KBError('not_found', 'Modifica non trovata');
    await this.loadProjects(c.path);
    // Restorable while the file is still as the agent left it.
    const current = this.files.has(c.path) ? (this.cache.get(c.path)?.content ?? null) : null;
    // A renamed agent shows its current name; a revoked one keeps the snapshot.
    const agent = this.state.agentRefs[c.agent.id] ? refOf(this.state.agentRefs, c.agent.id) : c.agent;
    return { ...c, agent, restorable: current === c.after };
  }

  async revertChange(id: string) {
    const c = await this.getChange(id);
    if (!c.restorable) throw new KBError('invalid', 'Questa modifica non si può ripristinare');
    if (c.before === null) {
      // The agent created the file: undoing it removes the file.
      await this.fileRequest('DELETE', '/v1/file', c.path);
      this.files.delete(c.path);
      this.cache.delete(c.path);
      delete this.state.authors[c.path];
    } else if (c.after === null) {
      await this.put(c.path, c.before, { overwrite: false });
    } else {
      await this.put(c.path, c.before, { overwrite: true, ifMatch: this.files.get(c.path)?.etag });
    }
    this.persist();
    await this.afterWrite();
    this.emit({ type: 'changed', paths: [c.path] });
  }

  // ─── teams ────────────────────────────────────────────────────────────────

  private toTeam(row: TeamRow): Team {
    return { id: row.id, name: row.name, role: row.role, createdAt: row.created_at };
  }

  async listTeams() {
    const { teams } = await this.request<{ teams: TeamRow[] }>('GET', '/v1/teams');
    return teams.map((t) => this.toTeam(t));
  }

  async getTeam(id: string) {
    const { team } = await this.request<{ team: TeamRow }>('GET', `/v1/teams/${encodeURIComponent(id)}`);
    return this.toTeam(team);
  }

  async createTeam(name: string) {
    const { team } = await this.request<{ team: TeamRow }>('POST', '/v1/teams', { body: { name } });
    return this.toTeam(team);
  }

  async renameTeam(id: string, name: string) {
    await this.request('PATCH', `/v1/teams/${encodeURIComponent(id)}`, { body: { name } });
  }

  async deleteTeam(id: string) {
    await this.request('DELETE', `/v1/teams/${encodeURIComponent(id)}`);
    await this.reconcile(true).catch(() => {});
  }

  async listTeamMembers(teamId: string): Promise<TeamMember[]> {
    const { members } = await this.request<{
      members: { user_id: string; role: TeamRole; joined_at: string; email: string | null; name: string | null }[];
    }>('GET', `/v1/teams/${encodeURIComponent(teamId)}/members`);
    return members.map((m) => ({
      userId: m.user_id,
      role: m.role,
      joinedAt: m.joined_at,
      name: m.name,
      email: m.email,
      isYou: m.user_id === this.userId,
    }));
  }

  async setMemberRole(teamId: string, userId: string, role: TeamRole) {
    await this.request('PATCH', `/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, { body: { role } });
  }

  async removeMember(teamId: string, userId: string) {
    await this.request('DELETE', `/v1/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`);
    // Leaving takes the team's projects away from this device.
    if (userId === this.userId) await this.reconcile(true).catch(() => {});
  }

  private toInvite(i: TeamInviteRow): TeamInvite {
    return { id: i.id, email: i.email, role: i.role, createdAt: i.created_at, expiresAt: i.expires_at };
  }

  async listTeamInvites(teamId: string) {
    const { invites } = await this.request<{ invites: TeamInviteRow[] }>(
      'GET',
      `/v1/teams/${encodeURIComponent(teamId)}/invites`,
    );
    return invites.map((i) => this.toInvite(i));
  }

  async inviteToTeam(teamId: string, email: string, role: InviteRole) {
    const { invite } = await this.request<{ invite: TeamInviteRow }>(
      'POST',
      `/v1/teams/${encodeURIComponent(teamId)}/invites`,
      { body: { email, role } },
    );
    return this.toInvite(invite);
  }

  async revokeInvite(teamId: string, inviteId: string) {
    await this.request('DELETE', `/v1/teams/${encodeURIComponent(teamId)}/invites/${encodeURIComponent(inviteId)}`);
  }

  async listMyInvites(): Promise<MyInvite[]> {
    const { invites } = await this.request<{
      invites: {
        id: string;
        team_id: string;
        team_name: string;
        role: TeamRole;
        invited_by: { name: string | null; email: string | null };
        created_at: string;
        expires_at: string;
      }[];
    }>('GET', '/v1/invites');
    return invites.map((i) => ({
      id: i.id,
      teamId: i.team_id,
      teamName: i.team_name,
      role: i.role,
      invitedBy: i.invited_by.name ?? i.invited_by.email,
      createdAt: i.created_at,
      expiresAt: i.expires_at,
    }));
  }

  async answerInvite(inviteId: string, accept: boolean) {
    await this.request('POST', `/v1/invites/${encodeURIComponent(inviteId)}/${accept ? 'accept' : 'decline'}`);
    // The team's projects show up right away.
    if (accept) await this.reconcile(true).catch(() => {});
  }

  /** Moves one of the user's own projects into a team they can write to (it stops being personal). */
  async moveProjectToTeam(project: string, teamId: string) {
    await this.loadProjects(project);
    if (teamOf(project)) throw new KBError('invalid', 'Il progetto è già in un team');
    this.assertCanWrite(teamProjectKey(project, teamId));
    await this.request('POST', `/v1/projects/${encodeURIComponent(project)}/move-to-team`, { body: { team_id: teamId } });
    const key = teamProjectKey(project, teamId);
    const re = (p: string) => (under(p, project) ? key + p.slice(project.length) : p);
    for (const p of [...this.files.keys(), ...this.cache.keys()]) if (under(p, project)) {
      this.files.delete(p);
      this.cache.delete(p);
      delete this.state.authors[p];
    }
    this.loaded.delete(project);
    this.summaries.delete(project);
    this.state.folders = this.state.folders.map(re);
    this.state.recentFiles = this.state.recentFiles.map((r) => ({ ...r, path: re(r.path) }));
    if (this.state.projects[project]) {
      this.state.projects[key] = this.state.projects[project];
      delete this.state.projects[project];
    }
    this.persist();
    await this.reconcile(true);
  }

  // ─── settings ─────────────────────────────────────────────────────────────

  async getSettings(): Promise<KBSettings> {
    return { lastSyncAt: this.state.lastSyncAt, server: API_URL.replace(/^https?:\/\//, ''), mcpUrl: MCP_URL };
  }

  async sync() {
    await this.ready();
    await this.reconcile(true);
    return this.getSettings();
  }

  async deleteAccount() {
    const key = this.userId ? this.storageKey() : null;
    await this.request('DELETE', '/v1/account');
    // The server no longer has this user: drop what is cached on the device too.
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (key) await AsyncStorage.removeItem(key).catch(() => {});
  }
}

function makeSnippet(line: string, q: string) {
  const lower = line.toLowerCase();
  const first = lower.indexOf(q);
  const start = Math.max(0, first - 24);
  const end = Math.min(line.length, start + 96);
  let text = line.slice(start, end);
  let offset = start;
  if (start > 0) {
    text = '…' + text;
    offset -= 1;
  }
  if (end < line.length) text += '…';
  const highlights: [number, number][] = [];
  let i = lower.indexOf(q, start);
  while (i !== -1 && i + q.length <= end) {
    highlights.push([i - offset, i - offset + q.length]);
    i = lower.indexOf(q, i + q.length);
  }
  return { text, highlights };
}
