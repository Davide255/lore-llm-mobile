import type {
  Agent,
  AgentPatch,
  ActivityEvent,
  Change,
  CreateAgentInput,
  CreateFileInput,
  CreateProjectInput,
  DeleteReceipt,
  FileDocument,
  FolderListing,
  KBSettings,
  KBSummary,
  NewAgent,
  Project,
  RecentFile,
  SearchResponse,
} from './types';

/**
 * Everything the app needs from the backend. The UI only talks to this
 * interface (through `src/data/hooks.ts`); `CloudKnowledgeBaseClient`
 * implements it on top of the lore-llm Worker.
 */
export interface KnowledgeBaseClient {
  // Browse
  getSummary(): Promise<KBSummary>;
  listProjects(): Promise<Project[]>;
  getProject(name: string): Promise<Project>;
  listFolder(path: string): Promise<FolderListing>;
  /** Every folder of a project (for "Move to…" and location pickers). */
  listFolderTree(project: string): Promise<string[]>;
  getFile(path: string): Promise<FileDocument>;
  listRecentFiles(limit?: number): Promise<RecentFile[]>;
  markOpened(path: string): Promise<void>;

  // Write
  /** Fails with `conflict` if `baseVersion` is stale, `read_only` for index.md. */
  writeFile(path: string, content: string, baseVersion?: string): Promise<FileDocument>;
  createFile(input: CreateFileInput): Promise<FileDocument>;
  createFolder(parent: string, name: string): Promise<string>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(name: string, patch: Partial<Pick<Project, 'description' | 'icon'>>): Promise<Project>;
  rename(path: string, newName: string): Promise<string>;
  move(path: string, targetFolder: string): Promise<string>;
  duplicate(path: string): Promise<string>;
  remove(path: string): Promise<DeleteReceipt>;
  undoRemove(token: string): Promise<void>;

  // Search
  search(query: string, project?: string | null): Promise<SearchResponse>;
  listRecentSearches(): Promise<string[]>;
  addRecentSearch(query: string): Promise<void>;
  removeRecentSearch(query: string): Promise<void>;

  // Agents (permissions live on the server; tokens are shown once)
  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent>;
  createAgent(input: CreateAgentInput): Promise<NewAgent>;
  updateAgent(id: string, patch: AgentPatch): Promise<Agent>;
  /** The agent's token stops working immediately; its changes stay in the log. */
  revokeAgent(id: string): Promise<void>;
  /** Files agents created, changed or deleted, newest first. */
  listActivity(): Promise<ActivityEvent[]>;
  getChange(id: string): Promise<Change>;
  /** Puts the file back as it was before the agent's change. */
  revertChange(id: string): Promise<void>;

  // Settings
  getSettings(): Promise<KBSettings>;
  sync(): Promise<KBSettings>;
  /** Permanently deletes the user's files, agents and activity on the server. */
  deleteAccount(): Promise<void>;

  /** Changes noticed in the background (agent writes). Returns an unsubscribe function. */
  subscribe(listener: (event: ServerEvent) => void): () => void;
}

export type ServerEvent = { type: 'changed'; paths: string[] };
