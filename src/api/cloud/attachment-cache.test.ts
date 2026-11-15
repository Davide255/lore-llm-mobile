import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

/**
 * Images and PDFs kept on the device: the first open downloads and keeps the file, later opens
 * (and opens without a connection) use that copy, and a changed file is downloaded again.
 */

register('./test-stubs.mjs', import.meta.url);
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = ((fn: () => void, ms: number) => realSetInterval(fn, ms).unref()) as unknown as typeof setInterval;
const { CloudKnowledgeBaseClient } = await import('./cloud-client.ts');
const { pathKey, versionKey } = await import('./blob-store.ts');

/** The device's storage: user → "path@etag" → uri. */
function memoryBlobs() {
  const saved = new Map<string, Map<string, string>>();
  const calls = { save: 0, cleared: [] as string[] };
  let failing = false;
  return {
    saved,
    calls,
    fail: (v: boolean) => void (failing = v),
    async find(user: string, path: string, etag: string | null) {
      const mine = saved.get(user);
      if (!mine) return null;
      if (etag) return mine.get(`${path}@${etag}`) ?? null;
      return [...mine].find(([k]) => k.startsWith(`${path}@`))?.[1] ?? null;
    },
    async save(user: string, path: string, etag: string, url: string, headers: Record<string, string>) {
      calls.save++;
      assert.match(url, /\/v1\/blob\?path=/);
      assert.equal(headers.authorization, 'Bearer token');
      if (failing) throw new Error('offline');
      const mine = saved.get(user) ?? new Map<string, string>();
      for (const k of mine.keys()) if (k.startsWith(`${path}@`)) mine.delete(k);
      const uri = `file:///files/${etag}/${path.split('/').pop()}`;
      mine.set(`${path}@${etag}`, uri);
      saved.set(user, mine);
      return uri;
    },
    async clear(user: string) {
      calls.cleared.push(user);
      saved.delete(user);
    },
  };
}

const withEtag = (kb: InstanceType<typeof CloudKnowledgeBaseClient>, path: string, etag: string) =>
  (kb as unknown as { files: Map<string, unknown> }).files.set(path, { path, etag, size: 1, uploaded: '2026-01-01T00:00:00Z' });

describe('attachments kept on the device', () => {
  const blobs = memoryBlobs();
  const kb = new CloudKnowledgeBaseClient();
  kb.blobStore = blobs;

  it('downloads and keeps the file on the first open, and answers with the local copy', async () => {
    await kb.setUser('u1');
    withEtag(kb, 'Proj/img/a.png', 'e1');
    const src = await kb.attachmentSource('Proj/img/a.png');
    assert.equal(src.uri, 'file:///files/e1/a.png');
    assert.deepEqual(src.headers, {});
    assert.equal(blobs.calls.save, 1);
  });

  it('opens the saved copy without downloading again', async () => {
    assert.equal((await kb.attachmentSource('Proj/img/a.png')).uri, 'file:///files/e1/a.png');
    assert.equal(blobs.calls.save, 1);
  });

  it('shares one download between two views opened together', async () => {
    withEtag(kb, 'Proj/b.pdf', 'p1');
    const [x, y] = await Promise.all([kb.attachmentSource('Proj/b.pdf'), kb.attachmentSource('Proj/b.pdf')]);
    assert.equal(x.uri, y.uri);
    assert.equal(blobs.calls.save, 2);
  });

  it('downloads again when the file changed', async () => {
    withEtag(kb, 'Proj/img/a.png', 'e2');
    assert.equal((await kb.attachmentSource('Proj/img/a.png')).uri, 'file:///files/e2/a.png');
    assert.equal(blobs.calls.save, 3);
  });

  it('offline, an older saved version is shown rather than nothing', async () => {
    blobs.fail(true);
    withEtag(kb, 'Proj/img/a.png', 'e3');
    assert.equal((await kb.attachmentSource('Proj/img/a.png')).uri, 'file:///files/e2/a.png');
  });

  it('with no saved copy and no connection, the server address is returned as before', async () => {
    withEtag(kb, 'Proj/img/never.png', 'n1');
    const src = await kb.attachmentSource('Proj/img/never.png');
    assert.match(src.uri, /\/v1\/blob\?path=Proj%2Fimg%2Fnever\.png$/);
    assert.equal(src.headers.authorization, 'Bearer token');
    blobs.fail(false);
  });

  it('an attachment whose version is unknown is not kept', async () => {
    const before = blobs.calls.save;
    const src = await kb.attachmentSource('Proj/unlisted.png');
    assert.match(src.uri, /^https?:\/\//);
    assert.equal(blobs.calls.save, before);
  });

  it('attachmentRequest gives the same local copy', async () => {
    withEtag(kb, 'Proj/img/a.png', 'e2');
    const r = await kb.attachmentRequest('Proj/img/a.png');
    assert.equal(r.url, 'file:///files/e2/a.png');
  });

  it('signing out takes the saved files off the device', async () => {
    await kb.setUser(null);
    assert.deepEqual(blobs.calls.cleared, ['u1']);
    assert.equal(blobs.saved.has('u1'), false);
  });
});

describe('where a saved attachment lives', () => {
  it('versions of one file share a prefix; other files and other versions do not', () => {
    assert.ok(versionKey('P/a.png', 'e1').startsWith(pathKey('P/a.png')));
    assert.ok(versionKey('P/a.png', 'e2').startsWith(pathKey('P/a.png')));
    assert.notEqual(versionKey('P/a.png', 'e1'), versionKey('P/a.png', 'e2'));
    assert.ok(!versionKey('P/b.png', 'e1').startsWith(pathKey('P/a.png')));
  });

  it('folder names are safe whatever the etag holds', () => {
    assert.match(versionKey('P/é ü.png', '"abc/def=="'), /^[A-Za-z0-9_-]+$/);
  });
});
