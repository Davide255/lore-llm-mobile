import assert from 'node:assert/strict';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/** Global search through GET /v1/search: one call per space, merged, with highlights. */

register('./test-stubs.mjs', import.meta.url);
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: () => void, ms: number) => realSetInterval(fn, ms).unref()) as unknown as typeof setInterval;
const { CloudKnowledgeBaseClient, makeSnippet } = await import('./cloud-client.ts');
const { createFakeWorker } = await import('./fake-worker.ts');

const worker = createFakeWorker();
globalThis.fetch = worker.fetch;
worker.addTeam('t1', 'Marketing', 'editor');
worker.put('', 'Mine/dragon.md', 'a red dragon sleeps\nnothing here');
worker.put('', 'Other/x.md', 'unrelated');
worker.put('t:t1', 'Plan/a.md', 'the dragon plan\nanother dragon line');

describe('global search', () => {
  const kb = new CloudKnowledgeBaseClient();
  before(() => kb.setUser('u1'));

  it('asks each space and merges, team projects keyed Name@teamId', async () => {
    worker.take();
    const r = await kb.search('drag');
    const calls = worker.take().filter((l) => l.includes('/v1/search'));
    assert.equal(calls.length, 2);
    assert.deepEqual(r.hits.map((h) => h.path), ['Mine/dragon.md', 'Plan@t1/a.md']);
    assert.deepEqual(r.byProject, [
      { project: 'Mine', matches: 1 },
      { project: 'Plan@t1', matches: 1 },
    ]);
    assert.equal(r.hits[1].extraMatches, 1);
  });

  it('filters by project on the client, keeping the counts of all projects', async () => {
    const r = await kb.search('dragon', 'Mine');
    assert.deepEqual(r.hits.map((h) => h.project), ['Mine']);
    assert.equal(r.byProject.length, 2);
  });

  it('empty query makes no request', async () => {
    worker.take();
    assert.equal((await kb.search('  ')).hits.length, 0);
    assert.equal(worker.take().length, 0);
  });
});

describe('makeSnippet', () => {
  it('highlights every term, prefixes included, and merges overlaps', () => {
    const s = makeSnippet('a red dragon', ['dra', 'dragon']);
    assert.deepEqual(s.highlights, [[6, 12]]);
  });
});
