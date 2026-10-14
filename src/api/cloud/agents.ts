/**
 * Agent rows from the Worker <-> the app's Agent shape, and who-wrote-what
 * from the audit log. Pure and import-free, so `npm test` runs it directly.
 */

export type AgentKind = 'claude' | 'codex';
export type AgentPermission = 'read' | 'read-write';

export const AGENT_KIND_LIST: AgentKind[] = ['claude', 'codex'];

/** Row of `GET /v1/agents`. */
export interface AgentRow {
  agent_id: string;
  name: string;
  agent_type?: string;
  project_scope: string;
  access_level: string;
  created_at: string;
}

/** Row of `GET /v1/audit`. */
export interface AuditRow {
  log_id: number;
  timestamp: string;
  agent_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  target_path: string;
}

/** Identity snapshot of the agent behind a change. `kind` is null once the agent is revoked and unknown. */
export interface AgentRef {
  id: string;
  name: string;
  kind: AgentKind | null;
}

export interface AgentFields {
  name: string;
  kind: AgentKind;
  permission: AgentPermission;
  /** Project names, or ['*'] for every project. */
  scope: string[];
}

export const toScope = (scope: string[]) => (scope.includes('*') ? '*' : scope.map((p) => `${p}/*`).join(','));

export const fromScope = (s: string) =>
  s === '*' || s.split(',').includes('*') ? ['*'] : s.split(',').map((p) => p.replace(/\/\*$/, ''));

export const toAgentFields = (row: AgentRow): AgentFields & { id: string; createdAt: string } => ({
  id: row.agent_id,
  name: row.name,
  kind: AGENT_KIND_LIST.includes(row.agent_type as AgentKind) ? (row.agent_type as AgentKind) : 'claude',
  permission: row.access_level === 'read_write' ? 'read-write' : 'read',
  scope: fromScope(row.project_scope),
  createdAt: row.created_at,
});

export const toPatch = (p: Partial<AgentFields>) => ({
  ...(p.name !== undefined ? { name: p.name } : {}),
  ...(p.kind !== undefined ? { agent_type: p.kind } : {}),
  ...(p.permission !== undefined ? { access_level: p.permission === 'read-write' ? 'read_write' : 'read_only' } : {}),
  ...(p.scope !== undefined ? { project_scope: toScope(p.scope) } : {}),
});

export interface Writer {
  agentId: string;
  at: string;
}

/**
 * Latest agent write per path from audit rows (any order). Only rows newer
 * than `after` are applied, so polling can feed just what's new. Returns the
 * newest log id seen.
 */
export function applyAudit(writers: Map<string, Writer>, rows: AuditRow[], after = 0): number {
  const fresh = rows.filter((r) => r.log_id > after).sort((a, b) => a.log_id - b.log_id);
  for (const r of fresh) writers.set(r.target_path, { agentId: r.agent_id, at: r.timestamp });
  return fresh.length ? fresh[fresh.length - 1].log_id : after;
}

/** The identity stored on events, so revoked agents keep their name. */
export function refOf(refs: Record<string, { name: string; kind: AgentKind }>, id: string): AgentRef {
  return refs[id] ? { id, ...refs[id] } : { id, name: 'Agente revocato', kind: null };
}

// An agent's write lands in R2 a moment before its audit row is inserted.
const AUDIT_SKEW_MS = 10_000;

/**
 * Whether the version uploaded at `uploaded` is the agent's write in the audit
 * log, rather than a later edit from one of the user's own apps.
 */
export function writtenByAgent(uploaded: string, writer: Writer | undefined): boolean {
  if (!writer) return false;
  return Date.parse(uploaded) - Date.parse(writer.at) <= AUDIT_SKEW_MS;
}
