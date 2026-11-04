import type {
  Agent,
  AttachmentSource,
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
  MyInvite,
  NewAgent,
  Project,
  RecentFile,
  SearchResponse,
  Team,
  TeamInvite,
  TeamMember,
  TeamRole,
  InviteRole,
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
  /** Paths of every file of a project, attachments included (to resolve [[wiki links]] and embeds). */
  listFiles(project: string): Promise<string[]>;
  /** The authenticated URL of an attachment (image or PDF). */
  attachmentSource(path: string): Promise<AttachmentSource>;
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

  // Teams (membership and invitations live on the server)
  listTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team>;
  createTeam(name: string): Promise<Team>;
  renameTeam(id: string, name: string): Promise<void>;
  /** Only a team without files can be deleted. */
  deleteTeam(id: string): Promise<void>;
  listTeamMembers(teamId: string): Promise<TeamMember[]>;
  setMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void>;
  /** Removes a member; removing yourself leaves the team. A team keeps at least one owner. */
  removeMember(teamId: string, userId: string): Promise<void>;
  listTeamInvites(teamId: string): Promise<TeamInvite[]>;
  inviteToTeam(teamId: string, email: string, role: InviteRole): Promise<TeamInvite>;
  revokeInvite(teamId: string, inviteId: string): Promise<void>;
  /** Moves one of your own projects into a team you can write to. */
  moveProjectToTeam(project: string, teamId: string): Promise<void>;
  /** Invitations sent to the signed-in user's email. */
  listMyInvites(): Promise<MyInvite[]>;
  answerInvite(inviteId: string, accept: boolean): Promise<void>;

  // Account
  /**
   * Permanently deletes the signed-in account: files, agents, team memberships and
   * the sign-in identity, on the server and on this device. Refused while the user is
   * the only owner of a team. Safe to retry. The caller signs out afterwards.
   */
  deleteAccount(): Promise<void>;

  // Settings
  getSettings(): Promise<KBSettings>;
  sync(): Promise<KBSettings>;

  /** Changes noticed in the background (agent writes). Returns an unsubscribe function. */
  subscribe(listener: (event: ServerEvent) => void): () => void;
}

export type ServerEvent = { type: 'changed'; paths: string[] };
