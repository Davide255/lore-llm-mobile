import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

/** Joining a team from an invitation: its projects must show up in the project list. */

register('./test-stubs.mjs', import.meta.url);
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: () => void, ms: number) => realSetInterval(fn, ms).unref()) as unknown as typeof setInterval;
const { CloudKnowledgeBaseClient } = await import('./cloud-client.ts');
const { createFakeWorker } = await import('./fake-worker.ts');

describe('accepting a team invitation', () => {
  it('lists the team projects right after joining', async () => {
    const worker = createFakeWorker();
    globalThis.fetch = worker.fetch;
    worker.put('', 'Mine/m.md', 'mine');
    worker.put('t:t1', 'Plan/a.md', 'team a');
    worker.invite('i1', 't1', 'Marketing', 'editor');

    const kb = new CloudKnowledgeBaseClient();
    await kb.setUser('u1');
    assert.deepEqual((await kb.listProjects()).map((p) => p.name), ['Mine']);
    assert.equal((await kb.listMyInvites()).length, 1);

    await kb.answerInvite('i1', true);
    const projects = await kb.listProjects();
    assert.deepEqual(projects.map((p) => [p.name, p.team?.name ?? null]).sort(), [['Mine', null], ['Plan@t1', 'Marketing']]);
  });

  it('picks the new team up on the next poll when it was joined elsewhere', async () => {
    const worker = createFakeWorker();
    globalThis.fetch = worker.fetch;
    worker.put('t:t1', 'Plan/a.md', 'team a');

    const kb = new CloudKnowledgeBaseClient();
    await kb.setUser('u1');
    assert.deepEqual(await kb.listProjects(), []);

    worker.addTeam('t1', 'Marketing', 'viewer'); // accepted from another device
    await (kb as any).reconcile();
    assert.deepEqual((await kb.listProjects()).map((p) => p.name), ['Plan@t1']);
  });
});
