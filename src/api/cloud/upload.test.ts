import assert from 'node:assert/strict';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * Uploading from the device through the cloud client, against the fake Worker: notes are written like
 * any note, attachments go up as a raw body with their progress reported, they show up in the folder
 * without being downloaded, and the rules (taken names, viewers, team owner) hold.
 */

register('./test-stubs.mjs', import.meta.url);
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: () => void, ms: number) => realSetInterval(fn, ms).unref()) as unknown as typeof setInterval;
const { CloudKnowledgeBaseClient } = await import('./cloud-client.ts');
const { createFakeWorker, fileGets } = await import('./fake-worker.ts');
const { KBError } = await import('../types.ts');

const worker = createFakeWorker();
globalThis.fetch = worker.fetch;
worker.addTeam('t1', 'Marketing', 'editor');
worker.addTeam('t2', 'Lettori', 'viewer');
worker.put('', 'Proj/a.md', 'note a');
worker.put('t:t2', 'Docs/d.md', 'docs d');

const BYTES = 'x'.repeat(10);

describe('uploading through the cloud client', () => {
  const kb = new CloudKnowledgeBaseClient();
  const requests = () => worker.take();
  const sent: { url: string; uri: string; headers: Record<string, string> }[] = [];

  before(async () => {
    await kb.setUser('u1');
    kb.local = {
      readText: async (uri) => `text of ${uri}`,
      // The device sends the file in two chunks, then the Worker answers.
      async putBinary(url, uri, { headers, onProgress, signal }) {
        if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        sent.push({ url, uri, headers });
        onProgress?.(5, 10);
        onProgress?.(10, 10);
        const res = await worker.fetch(url, { method: 'PUT', headers, body: BYTES });
        return { status: res.status, body: await res.text() };
      },
    };
  });

  it('writes a note like any other note and reports it as sent', async () => {
    const progress: number[][] = [];
    await kb.uploadFile('Proj/docs/n.md', { uri: 'file:///n.md', size: 20 }, (s, t) => progress.push([s, t]));
    assert.ok(worker.has('', 'Proj/docs/n.md'));
    assert.deepEqual(progress, [[20, 20]]);
    assert.equal((await kb.getFile('Proj/docs/n.md')).content, 'text of file:///n.md');
    requests();
  });

  it('streams an attachment as the raw body with the token, reporting the bytes sent', async () => {
    requests();
    const progress: number[][] = [];
    await kb.uploadFile('Proj/img/photo.png', { uri: 'file:///photo.png', size: 10 }, (s, t) => progress.push([s, t]));
    assert.deepEqual(progress, [[5, 10], [10, 10], [10, 10]]);
    assert.equal(sent.at(-1)!.headers.authorization, 'Bearer token');
    assert.match(sent.at(-1)!.url, /\/v1\/blob\?path=Proj%2Fimg%2Fphoto\.png$/);
    assert.ok(worker.has('', 'Proj/img/photo.png'));
    assert.ok(requests().includes('PUT /v1/blob?path=Proj/img/photo.png'));
  });

  it('shows the attachment in its folder without downloading it, and keeps it out of the note count', async () => {
    requests();
    const folder = await kb.listFolder('Proj/img');
    assert.deepEqual(folder.files.map((f) => [f.name, f.size]), [['photo.png', 10]]);
    assert.equal((await kb.listFolder('Proj')).folders.find((f) => f.name === 'img')?.fileCount, 1);
    // a project reload lists attachments and still fetches only notes
    await kb.sync();
    const l = requests();
    assert.ok(l.some((r) => /^GET \/v1\/files\?project=Proj&attachments=1/.test(r)));
    assert.ok(fileGets(l).every((g) => !/\.png$/.test(g)));
    const project = await kb.getProject('Proj');
    assert.equal(project.fileCount, 2); // a.md and docs/n.md
  });

  it('lists the paths already taken under a folder', async () => {
    const paths = await kb.listPaths('Proj');
    assert.ok(paths.includes('Proj/a.md') && paths.includes('Proj/img/photo.png'));
  });

  it('refuses a name that is taken, saying so', async () => {
    await assert.rejects(
      kb.uploadFile('Proj/img/photo.png', { uri: 'file:///again.png', size: 10 }),
      (e: Error & { code?: string }) => e instanceof KBError && e.code === 'exists',
    );
    await assert.rejects(
      kb.uploadFile('Proj/a.md', { uri: 'file:///a.md', size: 3 }),
      (e: Error & { code?: string }) => e.code === 'exists',
    );
  });

  it('turns a failed transfer into a network error, but lets an abort through untouched', async () => {
    const real = kb.local;
    kb.local = { ...real, putBinary: async () => { throw new Error('offline'); } };
    await assert.rejects(kb.uploadFile('Proj/off.png', { uri: 'u', size: 1 }), (e: Error & { code?: string }) => e.code === 'network');
    const ctl = new AbortController();
    ctl.abort();
    kb.local = real;
    await assert.rejects(kb.uploadFile('Proj/stop.png', { uri: 'u', size: 1 }, undefined, ctl.signal), (e: Error) => e.name === 'AbortError');
    assert.equal(worker.has('', 'Proj/stop.png'), false);
  });

  it('sends a team project to the team’s space and keeps viewers out before any request', async () => {
    worker.put('t:t1', 'Plan/a.md', 'team a');
    await kb.sync(); // the team's project appears
    await kb.listFolder('Plan@t1');
    await kb.uploadFile('Plan@t1/pic.jpg', { uri: 'file:///pic.jpg', size: 10 });
    assert.ok(worker.has('t:t1', 'Plan/pic.jpg'));
    assert.ok(requests().includes('PUT /v1/blob?path=Plan/pic.jpg&owner=t:t1'));

    await kb.listFolder('Docs@t2');
    requests();
    await assert.rejects(kb.uploadFile('Docs@t2/x.png', { uri: 'u', size: 1 }), (e: Error & { code?: string }) => e.code === 'read_only');
    await assert.rejects(kb.uploadFile('Docs@t2/x.md', { uri: 'u', size: 1 }), (e: Error & { code?: string }) => e.code === 'read_only');
    assert.deepEqual(requests().filter((r) => r.startsWith('PUT')), []);
  });

  it('refuses a file outside a project and a type the server does not store', async () => {
    await assert.rejects(kb.uploadFile('loose.md', { uri: 'u', size: 1 }), (e: Error & { code?: string }) => e.code === 'invalid');
    await assert.rejects(kb.uploadFile('Proj/clip.mp4', { uri: 'u', size: 1 }), (e: Error & { code?: string }) => e.code === 'invalid');
  });

  it('deletes an attachment for good: the receipt says there is nothing to undo', async () => {
    const receipt = await kb.remove('Proj/img/photo.png');
    assert.equal(receipt.undoable, false);
    assert.equal(worker.has('', 'Proj/img/photo.png'), false);
    const note = await kb.remove('Proj/docs/n.md');
    assert.equal(note.undoable, true);
    await kb.undoRemove(note.token);
    assert.ok(worker.has('', 'Proj/docs/n.md'));
  });

  it('does not offer to duplicate an attachment', async () => {
    await kb.uploadFile('Proj/dup.pdf', { uri: 'u', size: 10 });
    await assert.rejects(kb.duplicate('Proj/dup.pdf'), (e: Error & { code?: string }) => e.code === 'invalid');
  });
});
