import assert from 'node:assert/strict';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * Loading flow of the cloud client against an in-memory fake of the Worker:
 * launch loads the project list and the checklists only; a project's files are
 * loaded when it is opened; an idle poll costs one request.
 */

register('./test-stubs.mjs', import.meta.url);
// The client polls on a timer: keep it from holding the test process open.
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: () => void, ms: number) => realSetInterval(fn, ms).unref()) as unknown as typeof setInterval;
const { CloudKnowledgeBaseClient } = await import('./cloud-client.ts');

// ── fake backend ──
const files = new Map<string, { content: string; uploaded: string }>();
let version = 1;
let clock = 0;
const etagOf = (c: string) => 'e' + [...c].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16);
const put = (path: string, content: string) => {
  files.set(path, { content, uploaded: new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString() });
  version++;
};
put('Alpha/a.md', 'alpha a');
put('Alpha/b.md', 'needle in alpha');
put('Alpha/checklist.md', '- [x] one\n- [ ] two\n');
put('Alpha/index.md', '# Alpha');
put('Beta/x.md', 'beta x');
put('Beta/checklist.md', '- [ ] only\n');
put('Gamma/g.md', 'gamma g');

const log: string[] = [];
const meta = (p: string) => ({ path: p, size: files.get(p)!.content.length, uploaded: files.get(p)!.uploaded, etag: etagOf(files.get(p)!.content) });
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = (async (input: string, init?: RequestInit) => {
  const url = new URL(input);
  const q = url.searchParams;
  const route = `${init?.method ?? 'GET'} ${url.pathname}`;
  log.push(q.size ? `${route}?${[...q].map(([k, v]) => `${k}=${v}`).join('&')}` : route);
  switch (route) {
    case 'GET /v1/version': return ok({ version, updated_at: null });
    case 'GET /v1/audit': return ok({ items: [], next_before: null });
    case 'GET /v1/agents': return ok({ agents: [] });
    case 'GET /v1/projects': {
      const by = new Map<string, any>();
      for (const [path] of files) {
        const [name, ...rest] = path.split('/');
        const inP = rest.join('/');
        const row = by.get(name) ?? { name, file_count: 0, size: 0, updated_at: '', checklist: null };
        by.set(name, row);
        row.size += files.get(path)!.content.length;
        if (inP === 'index.md') continue;
        row.file_count++;
        if (files.get(path)!.uploaded > row.updated_at) row.updated_at = files.get(path)!.uploaded;
        if (inP === 'checklist.md') row.checklist = meta(path);
      }
      return ok({ projects: [...by.values()] });
    }
    case 'GET /v1/files': {
      const prefix = q.get('project') ? q.get('project') + '/' : '';
      return ok({ files: [...files.keys()].filter((p) => p.startsWith(prefix)).sort().map(meta) });
    }
    case 'GET /v1/file': {
      const p = q.get('path')!;
      return files.has(p) ? ok({ ...meta(p), content: files.get(p)!.content }) : ok({ error: 'Not found' }, 404);
    }
    case 'PUT /v1/file': {
      const body = JSON.parse(init!.body as string);
      const p = q.get('path')!;
      if (files.has(p) && !body.overwrite) return ok({ error: 'File already exists' }, 400);
      put(p, body.content);
      return ok({ action: 'CREATE', file: meta(p) }, 201);
    }
  }
  return ok({ error: 'unexpected ' + route }, 500);
}) as typeof fetch;

const take = () => log.splice(0);
const fileGets = (l: string[]) => l.filter((r) => r.startsWith('GET /v1/file?')).map((r) => r.split('path=')[1]);

describe('cloud client loading flow', () => {
  const kb = new CloudKnowledgeBaseClient();
  const reconcile = (): Promise<string[]> => (kb as any).reconcile();

  before(() => kb.setUser('u1'));

  it('launch loads the project list and the checklists, not the files', async () => {
    const projects = await kb.listProjects();
    const l = take();
    assert.deepEqual(fileGets(l).sort(), ['Alpha/checklist.md', 'Beta/checklist.md']);
    assert.ok(!l.some((r) => r.startsWith('GET /v1/files')), 'no file listing');
    assert.deepEqual(
      projects.map((p) => [p.name, p.fileCount, p.checklist]).sort(),
      [
        ['Alpha', 3, { done: 1, total: 2 }],
        ['Beta', 2, { done: 0, total: 1 }],
        ['Gamma', 1, null],
      ],
    );
  });

  it('opening a project loads its files and only its files', async () => {
    const alpha = await kb.listFolder('Alpha');
    const l = take();
    assert.ok(l.includes('GET /v1/files?project=Alpha'));
    assert.deepEqual(fileGets(l).sort(), ['Alpha/a.md', 'Alpha/b.md', 'Alpha/index.md']); // checklist cached by etag
    assert.deepEqual(alpha.files.map((f) => f.name).sort(), ['a.md', 'b.md']);
    assert.deepEqual(alpha.checklist?.progress, { done: 1, total: 2 });
  });

  it('reopening costs nothing and an idle poll reads only the change cursor', async () => {
    await kb.listFolder('Alpha');
    assert.deepEqual(take(), []);
    assert.deepEqual(await reconcile(), []);
    assert.deepEqual(take(), ['GET /v1/version']);
  });

  it('a change in a project that was not opened only refreshes its checklist', async () => {
    put('Beta/x.md', 'beta x v2');
    put('Beta/checklist.md', '- [x] only\n- [ ] more\n');
    assert.deepEqual(await reconcile(), ['Beta/checklist.md']);
    const l = take();
    assert.deepEqual(fileGets(l), ['Beta/checklist.md']);
    assert.ok(!l.includes('GET /v1/files?project=Beta'));
    assert.deepEqual((await kb.getProject('Beta')).checklist, { done: 1, total: 2 });
  });

  it('a change in an opened project re-lists that project and pulls the changed file', async () => {
    put('Alpha/a.md', 'alpha a v2');
    await reconcile();
    const l = take();
    assert.deepEqual(fileGets(l), ['Alpha/a.md']);
    assert.ok(l.includes('GET /v1/files?project=Alpha'));
    assert.ok(!l.includes('GET /v1/files?project=Beta'));
  });

  it('writing into a project that was not opened loads it first', async () => {
    await assert.rejects(kb.createFile({ parent: 'Gamma', name: 'g.md', content: 'x' }), /esiste già/);
    const l = take();
    assert.ok(l.includes('GET /v1/files?project=Gamma'));
    assert.ok(!l.some((r) => r.startsWith('PUT')));
    const created = await kb.createFile({ parent: 'Gamma', name: 'new.md', content: 'hello' });
    assert.equal(created.content, 'hello');
    take();
  });

  it('search is what opens the remaining projects', async () => {
    const found = await kb.search('needle');
    assert.ok(take().includes('GET /v1/files?project=Beta'));
    assert.deepEqual(found.hits.map((h) => h.path), ['Alpha/b.md']);
  });

  it('summary and recent files do not need the files of every project', async () => {
    assert.equal((await kb.getSummary()).projectCount, 3);
    await kb.markOpened('Beta/x.md');
    assert.deepEqual((await kb.listRecentFiles()).map((r) => r.path), ['Beta/x.md']);
  });
});
