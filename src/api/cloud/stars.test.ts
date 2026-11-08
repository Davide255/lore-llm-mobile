import assert from 'node:assert/strict';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/** Stars on notes and projects, personal and team, against the fake Worker. */

register('./test-stubs.mjs', import.meta.url);
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: () => void, ms: number) => realSetInterval(fn, ms).unref()) as unknown as typeof setInterval;
const { CloudKnowledgeBaseClient } = await import('./cloud-client.ts');
const { createFakeWorker } = await import('./fake-worker.ts');

const worker = createFakeWorker();
globalThis.fetch = worker.fetch;
worker.addTeam('t1', 'Marketing', 'viewer');
worker.put('', 'Mine/a.md', 'a');
worker.put('t:t1', 'Plan/b.md', 'b');

describe('stars', () => {
  const kb = new CloudKnowledgeBaseClient();
  before(() => kb.setUser('u1'));

  it('stars notes and projects, personal and team (viewers too), with client paths', async () => {
    await kb.setStar('Mine', true);
    await kb.setStar('Mine/a.md', true);
    await kb.setStar('Plan@t1', true);
    await kb.setStar('Plan@t1/b.md', true);
    const stars = await kb.listStars();
    assert.deepEqual(
      stars.map((s) => [s.path, s.kind]).sort(),
      [
        ['Mine', 'project'],
        ['Mine/a.md', 'note'],
        ['Plan@t1', 'project'],
        ['Plan@t1/b.md', 'note'],
      ],
    );
  });

  it('unstars', async () => {
    await kb.setStar('Mine/a.md', false);
    assert.ok(!(await kb.listStars()).some((s) => s.path === 'Mine/a.md'));
  });

  it('refuses to star something that does not exist', async () => {
    await assert.rejects(kb.setStar('Mine/missing.md', true));
  });
});
