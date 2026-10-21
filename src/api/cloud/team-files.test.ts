import assert from 'node:assert/strict';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * Team projects in the cloud client, against the fake Worker: they are listed and loaded
 * like personal ones (keyed `Name@<teamId>`), every call carries the right owner, viewers
 * cannot write, and what happens in a team shows up on the next poll.
 */

register('./test-stubs.mjs', import.meta.url);
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: () => void, ms: number) => realSetInterval(fn, ms).unref()) as unknown as typeof setInterval;
const { CloudKnowledgeBaseClient } = await import('./cloud-client.ts');
const { createFakeWorker, fileGets } = await import('./fake-worker.ts');

const worker = createFakeWorker();
globalThis.fetch = worker.fetch;
worker.addTeam('t1', 'Marketing', 'editor');
worker.addTeam('t2', 'Lettori', 'viewer');
worker.put('', 'Mine/m.md', 'mine');
worker.put('t:t1', 'Plan/a.md', 'team a');
worker.put('t:t1', 'Plan/checklist.md', '- [x] one\n- [ ] two\n- [ ] three\n');
worker.put('t:t2', 'Docs/d.md', 'docs d');

describe('team projects in the cloud client', () => {
  const kb = new CloudKnowledgeBaseClient();
  const reconcile = (): Promise<string[]> => (kb as any).reconcile();
  const requests = () => worker.take();

  before(() => kb.setUser('u1'));

  it('lists team projects next to personal ones, with their team and role', async () => {
    const projects = await kb.listProjects();
    const l = requests();
    assert.deepEqual(
      projects.map((p) => [p.name, p.title, p.team?.name ?? null, p.access, p.fileCount]).sort(),
      [
        ['Docs@t2', 'Docs', 'Lettori', 'viewer', 1],
        ['Mine', 'Mine', null, 'owner', 1],
        ['Plan@t1', 'Plan', 'Marketing', 'editor', 2],
      ].sort(),
    );
    assert.deepEqual(projects.find((p) => p.name === 'Plan@t1')?.checklist, { done: 1, total: 3 });
    assert.ok(l.includes('GET /v1/projects?owner=t:t1') && l.includes('GET /v1/projects'));
    // only the one checklist is downloaded, from the team's space
    assert.deepEqual(fileGets(l), ['t:t1:Plan/checklist.md']);
  });

  it('opening a team project loads its files with the team as owner', async () => {
    const plan = await kb.listFolder('Plan@t1');
    const l = requests();
    assert.ok(l.includes('GET /v1/files?project=Plan&owner=t:t1'));
    assert.deepEqual(fileGets(l), ['t:t1:Plan/a.md']);
    assert.equal(plan.name, 'Plan'); // the label, not the key
    assert.equal(plan.access, 'editor');
    assert.deepEqual(plan.files.map((f) => f.path), ['Plan@t1/a.md']);
    assert.equal((await kb.getFile('Plan@t1/a.md')).content, 'team a');
    assert.equal((await kb.getFile('Plan@t1/a.md')).access, 'editor');
    requests();
  });

  it('writes into a team project with the plain path and the team as owner', async () => {
    const created = await kb.createFile({ parent: 'Plan@t1', name: 'new.md', content: 'hello team' });
    assert.equal(created.path, 'Plan@t1/new.md');
    const put = requests().filter((r) => r.startsWith('PUT'));
    assert.deepEqual(put, ['PUT /v1/file?path=Plan/new.md&owner=t:t1']);
    assert.equal(worker.has('t:t1', 'Plan/new.md'), true);
    assert.equal(worker.has('', 'Plan/new.md'), false, 'nothing leaks into the personal space');
    await kb.writeFile('Plan@t1/new.md', 'edited');
    assert.equal((await kb.getFile('Plan@t1/new.md')).content, 'edited');
    requests();
  });

  it('viewers cannot write: refused before any request is made', async () => {
    await kb.listFolder('Docs@t2');
    requests();
    await assert.rejects(kb.createFile({ parent: 'Docs@t2', name: 'x.md', content: 'x' }), { code: 'read_only' });
    await assert.rejects(kb.writeFile('Docs@t2/d.md', 'changed'), { code: 'read_only' });
    await assert.rejects(kb.remove('Docs@t2/d.md'), { code: 'read_only' });
    assert.deepEqual(requests().filter((r) => !r.startsWith('GET')), []);
    assert.equal((await kb.getFile('Docs@t2/d.md')).content, 'docs d'); // reading is fine
    requests();
  });

  it('refuses to move files between the personal space and a team', async () => {
    await kb.listFolder('Mine');
    requests();
    await assert.rejects(kb.move('Mine/m.md', 'Plan@t1'), /spazi diversi/);
    assert.deepEqual(requests().filter((r) => r.startsWith('POST')), []);
  });

  it('renaming a team project keeps its team', async () => {
    const renamed = await kb.rename('Plan@t1', 'Roadmap');
    assert.equal(renamed, 'Roadmap@t1');
    assert.equal(worker.has('t:t1', 'Roadmap/a.md'), true);
    assert.equal(worker.has('t:t1', 'Plan/a.md'), false);
    const names = (await kb.listProjects()).map((p) => p.name).sort();
    assert.deepEqual(names, ['Docs@t2', 'Mine', 'Roadmap@t1']);
    requests();
  });

  it('a teammate editing an opened team project is picked up on the next poll', async () => {
    worker.put('t:t1', 'Roadmap/a.md', 'team a v2');
    const changed = await reconcile();
    assert.ok(changed.includes('Roadmap@t1/a.md'));
    assert.equal((await kb.getFile('Roadmap@t1/a.md')).content, 'team a v2');
    requests();
  });

  it('joining a team brings its projects, leaving takes them away', async () => {
    worker.addTeam('t3', 'Nuovo', 'owner');
    worker.put('t:t3', 'Fresh/f.md', 'fresh');
    await reconcile();
    assert.ok((await kb.listProjects()).some((p) => p.name === 'Fresh@t3' && p.access === 'owner'));

    requests();
    worker.removeTeam('t3');
    await reconcile();
    assert.ok(!(await kb.listProjects()).some((p) => p.name === 'Fresh@t3'));
    assert.ok(!requests().some((r) => r.includes('t:t3')), 'no calls into the team it left');
  });

  it('moves a personal project into a team', async () => {
    await kb.moveProjectToTeam('Mine', 't1');
    const names = (await kb.listProjects()).map((p) => p.name).sort();
    assert.deepEqual(names, ['Docs@t2', 'Mine@t1', 'Roadmap@t1']);
    assert.equal(worker.has('t:t1', 'Mine/m.md'), true);
    assert.equal(worker.has('', 'Mine/m.md'), false);
    assert.equal((await kb.getFile('Mine@t1/m.md')).content, 'mine');
    await assert.rejects(kb.moveProjectToTeam('Mine@t1', 't1'), /già in un team/);
    await assert.rejects(kb.createProject({ name: 'Bad@name', description: '', icon: 'folder', withChecklist: false }), /Nome progetto non valido/);
  });
});
