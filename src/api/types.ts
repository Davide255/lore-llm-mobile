import type { AgentKind, AgentPermission, AgentRef } from './cloud/agents';

/**
 * Domain types shared by the UI and every KnowledgeBaseClient implementation.
 *
 * The knowledge base is a tree of folders and markdown files:
 *
 *   <root>/
 *     <project>/            ← top-level folders are "projects"
 *       index.md            ← compiled by the backend, read-only for clients
 *       checklist.md        ← nested task list, editable
 *       <any>.md / <dir>/   ← free-form markdown files and folders
 *
 * Every entry is addressed by its path relative to the root, using "/" as
 * separator and without leading slash (e.g. "Athly Dashboard/decisioni/adr-001.md").
 */

export type ISODate = string;

export type { AgentKind, AgentPermission, AgentRef };

/** Who wrote the current version of a file: one of your apps, or an agent. */
export type Author = 'you' | 'agent';

/** Special role of a file inside a project. */
export type FileRole = 'index' | 'checklist' | 'doc';

export type ProjectIcon =
  | 'folder'
  | 'fitness'
  | 'web'
  | 'server'
  | 'campaign'
  | 'science'
  | 'book'
  | 'code'
  | 'design'
  | 'rocket';

export interface ChecklistProgress {
  done: number;
  total: number;
}

export interface Project {
  /** Also the project's root path. */
  name: string;
  description: string;
  icon: ProjectIcon;
  fileCount: number;
  updatedAt: ISODate;
  checklist: ChecklistProgress | null;
}

export interface FolderEntry {
  kind: 'folder';
  path: string;
  name: string;
  fileCount: number;
  folderCount: number;
  updatedAt: ISODate;
}

export interface FileEntry {
  kind: 'file';
  path: string;
  name: string;
  role: FileRole;
  /** Size in bytes. */
  size: number;
  updatedAt: ISODate;
  author: Author;
  /** The agent that wrote the current version (author = 'agent'). */
  agent?: AgentRef;
}

export type Entry = FolderEntry | FileEntry;

export interface FolderListing {
  path: string;
  name: string;
  project: string;
  isProjectRoot: boolean;
  /** Only present on project roots. */
  index: FileEntry | null;
  checklist: (FileEntry & { progress: ChecklistProgress }) | null;
  folders: FolderEntry[];
  files: FileEntry[];
}

export interface FileDocument {
  path: string;
  name: string;
  project: string;
  role: FileRole;
  content: string;
  size: number;
  updatedAt: ISODate;
  /** Opaque version used for optimistic concurrency on writes. */
  version: string;
  author: Author;
  /** The agent that wrote the current version (author = 'agent'). */
  agent?: AgentRef;
  /** index.md only. */
  tokenCount?: number;
}

export interface KBSummary {
  projectCount: number;
  fileCount: number;
  totalBytes: number;
}

export interface RecentFile {
  path: string;
  name: string;
  project: string;
  role: FileRole;
  openedAt: ISODate;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchSnippet {
  text: string;
  /** [start, end) character ranges to highlight inside `text`. */
  highlights: [number, number][];
}

export interface SearchHit {
  path: string;
  name: string;
  project: string;
  role: FileRole;
  snippet: SearchSnippet;
  /** Occurrences in the file beyond the one shown in `snippet`. */
  extraMatches: number;
}

export interface SearchResponse {
  query: string;
  totalMatches: number;
  hits: SearchHit[];
  /** Match counts per project, ignoring the project filter. */
  byProject: { project: string; matches: number }[];
}

// ─── Agents & activity ───────────────────────────────────────────────────────

/** An agent registered on the Lore server (its token is shown only at creation). */
export interface Agent {
  id: string;
  /** Friendly name chosen by the user. */
  name: string;
  kind: AgentKind;
  permission: AgentPermission;
  /** Project names, or ['*'] for every project. */
  scope: string[];
  createdAt: ISODate;
  /** Its latest file modification in the audit log. */
  lastWriteAt: ISODate | null;
}

export interface CreateAgentInput {
  kind: AgentKind;
  name: string;
  permission: AgentPermission;
  scope: string[];
}

export type AgentPatch = Partial<Pick<Agent, 'name' | 'kind' | 'permission' | 'scope'>>;

/** A freshly created agent. The token is not stored anywhere: it is shown once. */
export interface NewAgent {
  agent: Agent;
  token: string;
  expiresAt: ISODate;
  /** MCP endpoint (Streamable HTTP) the agent connects to. */
  mcpUrl: string;
}

export type ActivityKind = 'write' | 'create' | 'delete';

/** A file an agent created, changed or deleted (from the server's audit log). */
export interface ActivityEvent {
  id: string;
  agent: AgentRef;
  kind: ActivityKind;
  project: string;
  path: string;
  at: ISODate;
  added?: number;
  removed?: number;
  /** Present when the app saw both versions, so the change has a diff. */
  changeId?: string;
}

export interface Change {
  id: string;
  agent: AgentRef;
  path: string;
  project: string;
  at: ISODate;
  /** null: the agent created the file. */
  before: string | null;
  /** null: the agent deleted the file. */
  after: string | null;
  added: number;
  removed: number;
  /** The file is still as the agent left it, so it can be put back. */
  restorable: boolean;
}

// ─── Teams ───────────────────────────────────────────────────────────────────

/** What a person may do in a team's files: owners also manage the team, editors write, viewers read. */
export type TeamRole = 'owner' | 'editor' | 'viewer';

/** Roles an invitation can grant (owners are made by promoting a member). */
export type InviteRole = Exclude<TeamRole, 'owner'>;

export interface Team {
  id: string;
  name: string;
  /** The signed-in user's role in the team. */
  role: TeamRole;
  createdAt: ISODate;
}

export interface TeamMember {
  userId: string;
  role: TeamRole;
  joinedAt: ISODate;
  name: string | null;
  email: string | null;
  isYou: boolean;
}

/** An invitation sent by the team, still waiting for an answer. */
export interface TeamInvite {
  id: string;
  email: string;
  role: InviteRole;
  createdAt: ISODate;
  expiresAt: ISODate;
}

/** An invitation addressed to the signed-in user. */
export interface MyInvite {
  id: string;
  teamId: string;
  teamName: string;
  role: TeamRole;
  /** Who sent it: name, else email. */
  invitedBy: string | null;
  createdAt: ISODate;
  expiresAt: ISODate;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface KBSettings {
  lastSyncAt: ISODate | null;
  /** Host of the Lore server the app talks to. */
  server: string;
  /** The MCP endpoint: what a connector (Claude, ChatGPT) is pointed at; it signs in through OAuth. */
  mcpUrl: string;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export type NewFileTemplate = 'empty' | 'sections' | 'checklist';

export interface CreateProjectInput {
  name: string;
  description: string;
  icon: ProjectIcon;
  withChecklist: boolean;
}

export interface CreateFileInput {
  /** Parent folder path. */
  parent: string;
  /** File name including ".md". */
  name: string;
  content: string;
}

/** Returned by delete so the UI can offer an undo window. */
export interface DeleteReceipt {
  token: string;
  path: string;
  kind: 'file' | 'folder';
  /** Undo is possible until this instant. */
  undoUntil: ISODate;
}

export class KBError extends Error {
  constructor(
    public code: 'not_found' | 'conflict' | 'exists' | 'read_only' | 'invalid' | 'network',
    message: string,
  ) {
    super(message);
  }
}
