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
const { createFakeWorker, fileGets } = await import('./fake-worker.ts');

const worker = createFakeWorker();
globalThis.fetch = worker.fetch;
const put = (path: string, content: string) => worker.put('', path, content);
put('Alpha/a.md', 'alpha a');
put('Alpha/b.md', 'needle in alpha');
put('Alpha/checklist.md', '- [x] one\n- [ ] two\n');
put('Alpha/index.md', '# Alpha');
put('Beta/x.md', 'beta x');
put('Beta/checklist.md', '- [ ] only\n');
put('Gamma/g.md', 'gamma g');
const take = worker.take;

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
