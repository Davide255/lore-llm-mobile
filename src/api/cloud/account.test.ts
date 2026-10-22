import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

/**
 * Account deletion in the cloud client, against the fake Worker: the call reaches
 * `DELETE /v1/account`, the cached copy on the device goes away with it, and a team
 * the user alone owns blocks the deletion with an explanation they can act on.
 */

register('./test-stubs.mjs', import.meta.url);
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: () => void, ms: number) => realSetInterval(fn, ms).unref()) as unknown as typeof setInterval;
const { CloudKnowledgeBaseClient } = await import('./cloud-client.ts');
const { createFakeWorker } = await import('./fake-worker.ts');

describe('account deletion in the cloud client', () => {
  it('deletes the account on the server and the cached copy on the device', async () => {
    const worker = createFakeWorker();
    globalThis.fetch = worker.fetch;
    worker.put('', 'Mine/m.md', 'mine');
    const kb = new CloudKnowledgeBaseClient();
    await kb.setUser('u1');
    (globalThis as { removedKeys?: string[] }).removedKeys = [];

    await kb.deleteAccount();

    assert.ok(worker.take().includes('DELETE /v1/account'));
    assert.equal(worker.has('', 'Mine/m.md'), false);
    assert.deepEqual((globalThis as { removedKeys?: string[] }).removedKeys, ['lore.cloud.v1:u1']);
  });

  it('keeps the local copy and explains when the user is the only owner of a team', async () => {
    const worker = createFakeWorker();
    globalThis.fetch = worker.fetch;
    worker.addTeam('t1', 'Marketing', 'owner');
    worker.blockAccountDeletion(true);
    const kb = new CloudKnowledgeBaseClient();
    await kb.setUser('u1');
    (globalThis as { removedKeys?: string[] }).removedKeys = [];

    await assert.rejects(kb.deleteAccount(), (e: Error & { code?: string }) => e.code === 'invalid' && /unico proprietario/.test(e.message));
    assert.deepEqual((globalThis as { removedKeys?: string[] }).removedKeys, []);
  });

  it('reports an unreachable server and keeps the local copy', async () => {
    const kb = new CloudKnowledgeBaseClient();
    await kb.setUser('u1');
    (globalThis as { removedKeys?: string[] }).removedKeys = [];
    globalThis.fetch = (async () => {
      throw new TypeError('offline');
    }) as typeof fetch;

    await assert.rejects(kb.deleteAccount(), (e: Error & { code?: string }) => e.code === 'network');
    assert.deepEqual((globalThis as { removedKeys?: string[] }).removedKeys, []);
  });
});
