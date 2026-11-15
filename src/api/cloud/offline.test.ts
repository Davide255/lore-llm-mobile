import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

/**
 * Offline reading: the notes the app downloaded are saved on the device, and a client started
 * without a connection answers from that copy; when the connection is back it catches up.
 */

register('./test-stubs.mjs', import.meta.url);
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: () => void, ms: number) => realSetInterval(fn, ms).unref()) as unknown as typeof setInterval;
const { CloudKnowledgeBaseClient } = await import('./cloud-client.ts');
const { createFakeWorker } = await import('./fake-worker.ts');
const { KBError } = await import('../types.ts');

const worker = createFakeWorker();
let offline = false;
globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
  if (offline) return Promise.reject(new TypeError('Network request failed'));
  return worker.fetch(...args);
}) as typeof fetch;
const put = (path: string, content: string) => worker.put('', path, content);
put('Alpha/a.md', 'alpha a');
put('Alpha/b.md', 'needle in alpha\nsecond line');
put('Alpha/checklist.md', '- [x] one\n- [ ] two\n');
put('Alpha/index.md', '# Alpha');
put('Beta/x.md', 'beta x');
put('Beta/checklist.md', '- [ ] only\n');

/** The device's storage, shared by the "launches" below. */
function memoryStore() {
  const files = new Map<string, string>();
  return {
    files,
    load: async (id: string) => files.get(id) ?? null,
    save: async (id: string, json: string) => void files.set(id, json),
    remove: async (id: string) => void files.delete(id),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const launch = (store: ReturnType<typeof memoryStore>) => {
  const kb = new CloudKnowledgeBaseClient();
  kb.mirrorStore = store;
  return kb;
};

describe('offline reading from the saved notes', () => {
  const store = memoryStore();

  it('saves the notes that were downloaded', async () => {
    const kb = launch(store);
    await kb.setUser('u1');
    await kb.listFolder('Alpha'); // opening a project downloads its notes
    await kb.getFile('Alpha/a.md');
    await sleep(1700); // the save is delayed
    const saved = JSON.parse(store.files.get('u1')!);
    assert.equal(saved.v, 1);
    assert.deepEqual(saved.loaded, ['Alpha']);
    assert.ok(saved.cache.some((c: { path: string; content: string }) => c.path === 'Alpha/a.md' && c.content === 'alpha a'));
    assert.ok(saved.summaries.some((p: { name: string }) => p.name === 'Beta'), 'the project list is saved');
  });

  const kb = launch(store);
  it('opened offline, it lists projects and shows the opened project and its notes', async () => {
    offline = true;
    await kb.setUser('u1');
    assert.deepEqual((await kb.listProjects()).map((p) => p.name).sort(), ['Alpha', 'Beta']);
    const folder = await kb.listFolder('Alpha');
    assert.deepEqual(folder.files.map((f) => f.name).sort(), ['a.md', 'b.md']);
    assert.equal(folder.checklist?.progress.done, 1);
    assert.equal((await kb.getFile('Alpha/a.md')).content, 'alpha a');
    assert.deepEqual(await kb.listFiles('Alpha'), ['Alpha/a.md', 'Alpha/b.md', 'Alpha/checklist.md', 'Alpha/index.md']);
  });

  it('a note that was never downloaded says so instead of failing in silence', async () => {
    await assert.rejects(kb.getFile('Beta/x.md'), (e: unknown) => e instanceof KBError && e.code === 'network');
  });

  it('searches the saved notes', async () => {
    const r = await kb.search('needle');
    assert.deepEqual(r.hits.map((h) => h.path), ['Alpha/b.md']);
    assert.ok(!(await kb.search('beta')).hits.some((h) => h.path === 'Beta/x.md'), 'Beta/x.md was not downloaded');
  });

  it('writing offline is refused, not lost', async () => {
    await assert.rejects(kb.writeFile('Alpha/a.md', 'changed'), (e: unknown) => e instanceof KBError && e.code === 'network');
    assert.equal((await kb.getFile('Alpha/a.md')).content, 'alpha a');
  });

  it('when the connection is back it catches up with the server', async () => {
    put('Alpha/new.md', 'written elsewhere');
    put('Alpha/a.md', 'alpha a v2');
    offline = false;
    (kb as unknown as { retryAt: number }).retryAt = 0;
    const changed = new Promise<void>((resolve) => kb.subscribe((e) => e.type === 'changed' && resolve()));
    await kb.listProjects(); // answers at once, refreshes in the background
    await changed;
    const folder = await kb.listFolder('Alpha');
    assert.ok(folder.files.some((f) => f.name === 'new.md'));
    assert.equal((await kb.getFile('Alpha/a.md')).content, 'alpha a v2');
  });

  it('another account does not see them, and signing out takes them off the device', async () => {
    const other = launch(store);
    offline = true;
    await other.setUser('u2');
    await assert.rejects(other.listProjects(), (e: unknown) => e instanceof KBError && e.code === 'network');
    await kb.setUser(null);
    assert.equal(store.files.has('u1'), false);
    offline = false;
  });
});
