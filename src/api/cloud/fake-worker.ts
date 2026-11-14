/**
 * In-memory stand-in for the lore-llm Worker, for client tests: the user's own space
 * plus teams (with roles), `?owner=` on the file routes, per-space change cursors,
 * and a log of every request the client makes.
 */

type TeamRole = 'owner' | 'editor' | 'viewer';
interface Stored {
  content: string;
  uploaded: string;
}

const ATTACHMENT_TYPE = /\.(png|jpe?g|gif|webp|svg|pdf)$/i;
const isNote = (path: string) => path.toLowerCase().endsWith('.md');

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const etagOf = (c: string) => 'e' + [...c].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16);

/** The user's own space is owner `''`; a team's is `t:<id>`. */
export function createFakeWorker() {
  const spaces = new Map<string, Map<string, Stored>>([['', new Map()]]);
  const versions = new Map<string, number>([['', 1]]);
  const teams = new Map<string, { name: string; role: TeamRole }>();
  const log: string[] = [];
  const stars = new Map<string, string>();
  /** Invitations addressed to the user, by invite id. */
  const invites = new Map<string, { teamId: string; teamName: string; role: TeamRole }>();
  let clock = 0;
  let accountBlocked = false;
  /** Rows of `GET /v1/agents` and `GET /v1/audit` (newest first). */
  const agents: { agent_id: string; name: string; agent_type: string; project_scope: string; access_level: string; created_at: string }[] = [];
  const audit: { log_id: number; timestamp: string; agent_id: string; action: 'CREATE' | 'UPDATE' | 'DELETE'; target_path: string }[] = [];
  let logId = 0;

  const space = (owner: string) => {
    if (!spaces.has(owner)) spaces.set(owner, new Map());
    return spaces.get(owner)!;
  };
  const bump = (owner: string) => versions.set(owner, (versions.get(owner) ?? 0) + 1);

  /** Server-side write (another device, a teammate): bumps the space's cursor. */
  function put(owner: string, path: string, content: string, at?: Date) {
    space(owner).set(path, { content, uploaded: (at ?? new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock))).toISOString() });
    bump(owner);
  }
  /** An agent writes a file of the user's own space: the write plus its audit row. */
  function agentWrite(agentId: string, path: string, content: string, at = new Date()) {
    const action = space('').has(path) ? 'UPDATE' : 'CREATE';
    put('', path, content, at);
    audit.unshift({ log_id: ++logId, timestamp: at.toISOString(), agent_id: agentId, action, target_path: path });
  }
  function addTeam(id: string, name: string, role: TeamRole) {
    teams.set(id, { name, role });
    space(`t:${id}`);
    versions.set(`t:${id}`, versions.get(`t:${id}`) ?? 0);
  }
  const meta = (owner: string, path: string) => {
    const f = space(owner).get(path)!;
    return { path, size: f.content.length, uploaded: f.uploaded, etag: etagOf(f.content) };
  };

  async function fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const q = url.searchParams;
    const method = init?.method ?? 'GET';
    log.push(q.size ? `${method} ${url.pathname}?${[...q].map(([k, v]) => `${k}=${v}`).join('&')}` : `${method} ${url.pathname}`);

    const owner = q.get('owner') ?? '';
    const role: TeamRole | null = owner === '' ? 'owner' : (teams.get(owner.slice(2))?.role ?? null);
    const route = `${method} ${url.pathname}`;
    const isFileRoute = /^(GET|PUT|DELETE|POST) \/v1\/(file|files|files\/move|folder|projects|blob)$/.test(route);
    if (isFileRoute) {
      if (!role) return ok({ error: 'Forbidden' }, 403);
      if (method !== 'GET' && role === 'viewer') return ok({ error: 'Forbidden' }, 403);
    }
    // Attachments travel as raw bytes, everything else as JSON.
    const body = init?.body && url.pathname !== '/v1/blob' ? JSON.parse(init.body as string) : {};

    if (route === 'GET /v1/version') {
      const scopes = Object.fromEntries([...teams.keys()].map((id) => [`t:${id}`, { version: versions.get(`t:${id}`) ?? 0, updated_at: null }]));
      return ok({ version: versions.get('') ?? 0, updated_at: null, scopes });
    }
    if (route === 'DELETE /v1/account') {
      if (accountBlocked) return ok({ error: 'You are the only owner of a team: make someone else owner or delete the team first' }, 409);
      spaces.clear();
      spaces.set('', new Map());
      teams.clear();
      return ok({ ok: true, identity_deleted: true });
    }
    if (route === 'GET /v1/audit') return ok({ items: audit.slice(0, Number(q.get('limit') ?? 50)), next_before: null });
    if (route === 'GET /v1/agents') return ok({ agents });
    if (url.pathname === '/v1/stars') {
      if (!role) return ok({ error: 'Forbidden' }, 403);
      if (method === 'GET') {
        const rows = [...stars].map(([key, at]) => {
          const [o, path] = key.split('\0');
          return { owner: o, path, kind: path.includes('/') ? 'note' : 'project', starred_at: at };
        });
        return ok({ stars: rows.sort((a, b) => b.starred_at.localeCompare(a.starred_at)) });
      }
      const path = q.get('path') ?? '';
      const exists = path.includes('/') ? space(owner).has(path) : [...space(owner).keys()].some((p) => p.startsWith(`${path}/`));
      if (method === 'PUT') {
        if (!exists) return ok({ error: 'Not found' }, 404);
        stars.set(`${owner}\0${path}`, new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString());
      } else stars.delete(`${owner}\0${path}`);
      return ok({ ok: true });
    }
    if (route === 'GET /v1/search') {
      if (!role) return ok({ error: 'Forbidden' }, 403);
      // Every term must start a word of the note (AND, prefix), like the real index.
      const terms = (q.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const hits = [...space(owner)]
        .filter(([path]) => (!q.get('project') || path.split('/')[0] === q.get('project')) && !path.endsWith('/index.md'))
        .flatMap(([path, f]) => {
          const text = `${path}\n${f.content}`.toLowerCase();
          if (!terms.every((t) => new RegExp(`(^|[^a-z0-9])${t}`).test(text))) return [];
          const snippets = f.content
            .split('\n')
            .map((text, i) => ({ line: i + 1, text }))
            .filter((l) => terms.some((t) => l.text.toLowerCase().includes(t)));
          return [{ path, score: 1, pathMatch: terms.every((t) => path.toLowerCase().includes(t)), snippets }];
        });
      return ok({ hits, scanned: hits.length, truncated: false });
    }
    if (route === 'GET /v1/teams') {
      return ok({ teams: [...teams].map(([id, t]) => ({ id, name: t.name, role: t.role, created_by: 'x', created_at: '2026-01-01T00:00:00.000Z' })) });
    }

    if (route === 'GET /v1/invites') {
      return ok({
        invites: [...invites].map(([id, i]) => ({
          id,
          team_id: i.teamId,
          team_name: i.teamName,
          role: i.role,
          invited_by: { name: 'Ada', email: null },
          created_at: '2026-01-01T00:00:00.000Z',
          expires_at: '2026-02-01T00:00:00.000Z',
        })),
      });
    }
    const answer = /^POST \/v1\/invites\/([^/]+)\/(accept|decline)$/.exec(route);
    if (answer) {
      const invite = invites.get(decodeURIComponent(answer[1]!));
      if (!invite) return ok({ error: 'Not found' }, 404);
      invites.delete(decodeURIComponent(answer[1]!));
      if (answer[2] === 'accept') addTeam(invite.teamId, invite.teamName, invite.role);
      return ok({ ok: true });
    }

    if (route === 'GET /v1/projects') {
      const by = new Map<string, { name: string; file_count: number; size: number; updated_at: string; checklist: unknown }>();
      for (const [path, f] of space(owner)) {
        if (!isNote(path)) continue;
        const [name = '', ...rest] = path.split('/');
        const inProject = rest.join('/');
        const row = by.get(name) ?? { name, file_count: 0, size: 0, updated_at: '', checklist: null };
        by.set(name, row);
        row.size += f.content.length;
        if (inProject === 'index.md') continue;
        row.file_count++;
        if (f.uploaded > row.updated_at) row.updated_at = f.uploaded;
        if (inProject === 'checklist.md') row.checklist = meta(owner, path);
      }
      return ok({ projects: [...by.values()] });
    }
    if (route === 'GET /v1/files') {
      const prefix = q.get('project') ? `${q.get('project')}/` : '';
      const withAttachments = q.get('attachments') === '1';
      return ok({ files: [...space(owner).keys()].filter((p) => p.startsWith(prefix) && (withAttachments || isNote(p))).sort().map((p) => meta(owner, p)) });
    }
    if (route === 'GET /v1/file') {
      const p = q.get('path')!;
      return space(owner).has(p) ? ok({ ...meta(owner, p), content: space(owner).get(p)!.content }) : ok({ error: 'Not found' }, 404);
    }
    if (route === 'PUT /v1/file') {
      const p = q.get('path')!;
      if (space(owner).has(p) && !body.overwrite) return ok({ error: 'File already exists' }, 400);
      put(owner, p, body.content);
      return ok({ action: 'CREATE', file: meta(owner, p) }, 201);
    }
    if (route === 'PUT /v1/blob') {
      const p = q.get('path')!;
      if (!ATTACHMENT_TYPE.test(p)) return ok({ error: 'Path must end in .md or an allowed attachment type' }, 400);
      if (space(owner).has(p) && q.get('overwrite') !== '1') return ok({ error: `File already exists: ${p}` }, 400);
      const bytes = String(init?.body ?? '');
      put(owner, p, bytes);
      return ok({ action: 'CREATE', file: meta(owner, p) }, 201);
    }
    if (route === 'DELETE /v1/file') {
      const p = q.get('path')!;
      if (!space(owner).delete(p)) return ok({ error: 'Not found' }, 404);
      bump(owner);
      return ok({ ok: true });
    }
    if (route === 'POST /v1/files/move') {
      const from = body.from as string;
      const to = body.to as string;
      const moved = [...space(owner).keys()].filter((p) => p === from || p.startsWith(`${from}/`));
      for (const p of moved) {
        space(owner).set(to + p.slice(from.length), space(owner).get(p)!);
        space(owner).delete(p);
      }
      bump(owner);
      return ok({ ok: true, moved: moved.length });
    }
    const toTeam = /^POST \/v1\/projects\/([^/]+)\/move-to-team$/.exec(route);
    if (toTeam) {
      const project = decodeURIComponent(toTeam[1]!);
      const dest = `t:${body.team_id}`;
      const t = teams.get(body.team_id);
      if (!t) return ok({ error: 'Not found' }, 404);
      if (t.role === 'viewer') return ok({ error: 'Forbidden' }, 403);
      const moved = [...space('').keys()].filter((p) => p.startsWith(`${project}/`) && p !== `${project}/index.md`);
      if (!moved.length) return ok({ error: `Project not found: ${project}` }, 400);
      for (const p of moved) {
        space(dest).set(p, space('').get(p)!);
        space('').delete(p);
      }
      space('').delete(`${project}/index.md`);
      bump('');
      bump(dest);
      return ok({ ok: true, moved: moved.length });
    }
    return ok({ error: `unexpected ${route}` }, 500);
  }

  return {
    fetch: fetch as typeof globalThis.fetch,
    put,
    agentWrite,
    addAgent: (row: (typeof agents)[number]) => agents.push(row),
    /** Audit log ids start here (unique per run, so persisted client state never collides). */
    startLogIdsAt: (n: number) => (logId = n),
    addTeam,
    /** Someone invites the user to a team: it is pending until the user answers. */
    invite: (id: string, teamId: string, teamName: string, role: TeamRole) => invites.set(id, { teamId, teamName, role }),
    setRole: (id: string, role: TeamRole) => teams.set(id, { ...teams.get(id)!, role }),
    /** The user leaves (or is removed from) a team. */
    removeTeam: (id: string) => teams.delete(id),
    /** The user is the only owner of a team: the server refuses to delete the account. */
    blockAccountDeletion: (blocked: boolean) => (accountBlocked = blocked),
    log,
    /** Requests since the last call. */
    take: () => log.splice(0),
    has: (owner: string, path: string) => space(owner).has(path),
  };
}

/** Paths requested from `GET /v1/file`, with their owner: `["Alpha/a.md", "t:t1:Alpha/b.md"]`. */
export function fileGets(log: string[]): string[] {
  return log
    .filter((r) => r.startsWith('GET /v1/file?'))
    .map((r) => {
      const params = new URLSearchParams(r.split('?')[1]);
      return `${params.get('owner') ? `${params.get('owner')}:` : ''}${params.get('path')}`;
    });
}
