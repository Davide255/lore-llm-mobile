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

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const etagOf = (c: string) => 'e' + [...c].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16);

/** The user's own space is owner `''`; a team's is `t:<id>`. */
export function createFakeWorker() {
  const spaces = new Map<string, Map<string, Stored>>([['', new Map()]]);
  const versions = new Map<string, number>([['', 1]]);
  const teams = new Map<string, { name: string; role: TeamRole }>();
  const log: string[] = [];
  let clock = 0;

  const space = (owner: string) => {
    if (!spaces.has(owner)) spaces.set(owner, new Map());
    return spaces.get(owner)!;
  };
  const bump = (owner: string) => versions.set(owner, (versions.get(owner) ?? 0) + 1);

  /** Server-side write (another device, a teammate): bumps the space's cursor. */
  function put(owner: string, path: string, content: string) {
    space(owner).set(path, { content, uploaded: new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString() });
    bump(owner);
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
    const isFileRoute = /^(GET|PUT|DELETE|POST) \/v1\/(file|files|files\/move|folder|projects)$/.test(route);
    if (isFileRoute) {
      if (!role) return ok({ error: 'Forbidden' }, 403);
      if (method !== 'GET' && role === 'viewer') return ok({ error: 'Forbidden' }, 403);
    }
    const body = init?.body ? JSON.parse(init.body as string) : {};

    if (route === 'GET /v1/version') {
      const scopes = Object.fromEntries([...teams.keys()].map((id) => [`t:${id}`, { version: versions.get(`t:${id}`) ?? 0, updated_at: null }]));
      return ok({ version: versions.get('') ?? 0, updated_at: null, scopes });
    }
    if (route === 'GET /v1/audit') return ok({ items: [], next_before: null });
    if (route === 'GET /v1/agents') return ok({ agents: [] });
    if (route === 'GET /v1/teams') {
      return ok({ teams: [...teams].map(([id, t]) => ({ id, name: t.name, role: t.role, created_by: 'x', created_at: '2026-01-01T00:00:00.000Z' })) });
    }

    if (route === 'GET /v1/projects') {
      const by = new Map<string, { name: string; file_count: number; size: number; updated_at: string; checklist: unknown }>();
      for (const [path, f] of space(owner)) {
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
      return ok({ files: [...space(owner).keys()].filter((p) => p.startsWith(prefix)).sort().map((p) => meta(owner, p)) });
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
    addTeam,
    setRole: (id: string, role: TeamRole) => teams.set(id, { ...teams.get(id)!, role }),
    /** The user leaves (or is removed from) a team. */
    removeTeam: (id: string) => teams.delete(id),
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
