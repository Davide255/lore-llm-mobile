import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';

import type { UploadItem } from './upload-queue.ts';

// The `@/` alias used by the queue's imports is resolved by the same hook the client tests use.
register('../api/cloud/test-stubs.mjs', import.meta.url);
const { createUploadQueue } = await import('./upload-queue.ts');

/** A fake upload the test finishes by hand, reporting bytes as it goes. */
function harness(opts: { taken?: string[]; concurrency?: number } = {}) {
  const calls: { path: string; size: number; progress: (sent: number) => void; signal: AbortSignal; done: () => void; fail: (m: string) => void }[] = [];
  const log: string[] = [];
  let shown: UploadItem[] = [];
  const queue = createUploadQueue({
    concurrency: opts.concurrency,
    listPaths: async () => opts.taken ?? [],
    upload: (path, source, onProgress, signal) =>
      new Promise<void>((resolve, reject) => {
        const call = {
          path,
          size: source.size,
          progress: (sent: number) => onProgress(sent, source.size),
          signal,
          done: () => resolve(),
          fail: (m: string) => reject(new Error(m)),
        };
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        calls.push(call);
      }),
    finish: async () => void log.push('finish'),
    onChange: (items) => (shown = items.map((i) => ({ ...i }))),
    onSettled: () => void log.push('settled'),
  });
  const tick = () => new Promise((r) => setImmediate(r));
  return { queue, calls, log, shown: () => shown, tick };
}

const pick = (name: string, size: number, dir?: string) => ({ name, size, uri: `file:///${name}`, ...(dir ? { dir } : {}) });

describe('upload queue', () => {
  it('shows a row per file, grayed until its bytes are sent, then leaves it for the folder', async () => {
    const h = harness();
    await h.queue.enqueue('P', [pick('a.png', 1000), pick('b.md', 10)]);
    assert.deepEqual(h.shown().map((i) => [i.name, i.kind, i.state]), [['a.png', 'file', 'uploading'], ['b.md', 'file', 'uploading']]);

    h.calls[0]!.progress(250);
    assert.equal(h.shown()[0]!.sent, 250);
    assert.equal(h.shown()[0]!.total, 1000);

    h.calls[0]!.done();
    await h.tick();
    assert.deepEqual(h.shown().map((i) => i.name), ['b.md']);
    assert.ok(h.log.includes('settled'));
    assert.ok(!h.log.includes('finish')); // b.md is still going

    h.calls[1]!.done();
    await h.tick();
    assert.deepEqual(h.shown(), []);
    assert.equal(h.log.filter((l) => l === 'finish').length, 1);
  });

  it('is one row for a folder, counting the bytes and files of all its files together', async () => {
    const h = harness();
    await h.queue.enqueue('P', [pick('a.md', 100, 'trip'), pick('b.png', 300, 'trip/pics')], 'trip');
    assert.equal(h.shown().length, 1);
    assert.deepEqual([h.shown()[0]!.name, h.shown()[0]!.kind, h.shown()[0]!.total, h.shown()[0]!.count], ['trip', 'folder', 400, 2]);
    assert.deepEqual(h.calls.map((c) => c.path), ['P/trip/a.md', 'P/trip/pics/b.png']);

    h.calls[0]!.done();
    h.calls[1]!.progress(150);
    await h.tick();
    const row = h.shown()[0]!;
    assert.deepEqual([row.sent, row.done], [250, 1]);

    h.calls[1]!.done();
    await h.tick();
    assert.deepEqual(h.shown(), []);
  });

  it('sends only a few at a time and shows the others as waiting', async () => {
    const h = harness({ concurrency: 2 });
    await h.queue.enqueue('P', ['a', 'b', 'c', 'd'].map((n) => pick(`${n}.png`, 10)));
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.shown().map((i) => i.state), ['uploading', 'uploading', 'queued', 'queued']);
    h.calls[0]!.done();
    await h.tick();
    assert.equal(h.calls.length, 3);
    assert.equal(h.shown().find((i) => i.name === 'c.png')!.state, 'uploading');
  });

  it('keeps a failed row with the reason, and retrying sends it again', async () => {
    const h = harness();
    await h.queue.enqueue('P', [pick('a.png', 10)]);
    h.calls[0]!.fail('Caricamento interrotto');
    await h.tick();
    const row = h.shown()[0]!;
    assert.deepEqual([row.state, row.error], ['error', 'Caricamento interrotto']);
    assert.ok(!h.log.includes('settled'));

    h.queue.retry(row.id);
    assert.equal(h.calls.length, 2);
    assert.equal(h.shown()[0]!.state, 'uploading');
    assert.equal(h.shown()[0]!.sent, 0);
    h.calls[1]!.done();
    await h.tick();
    assert.deepEqual(h.shown(), []);
  });

  it('retries only the files of a folder that failed', async () => {
    const h = harness();
    await h.queue.enqueue('P', [pick('a.md', 10, 'f'), pick('b.md', 10, 'f')], 'f');
    h.calls[0]!.done();
    h.calls[1]!.fail('Esiste già un elemento con questo nome');
    await h.tick();
    const row = h.shown()[0]!;
    assert.equal(row.state, 'error');
    assert.match(row.error!, /^1 file su 2 non caricati: Esiste già/);
    assert.equal(row.done, 1);

    h.queue.retry(row.id);
    assert.deepEqual(h.calls.map((c) => c.path), ['P/f/a.md', 'P/f/b.md', 'P/f/b.md']);
    h.calls[2]!.done();
    await h.tick();
    assert.deepEqual(h.shown(), []);
  });

  it('dismissing stops the upload and clears the row, leaving the others alone', async () => {
    const h = harness();
    await h.queue.enqueue('P', [pick('a.png', 10), pick('b.png', 10)]);
    h.queue.dismiss(h.shown()[0]!.id);
    assert.equal(h.calls[0]!.signal.aborted, true);
    assert.equal(h.calls[1]!.signal.aborted, false);
    assert.deepEqual(h.shown().map((i) => i.name), ['b.png']);
    await h.tick();
    assert.deepEqual(h.shown().map((i) => i.name), ['b.png']); // the aborted one does not come back as an error
  });

  it('renames files whose names are taken in the folder or by an upload still going', async () => {
    const h = harness({ taken: ['P/a.png'] });
    await h.queue.enqueue('P', [pick('a.png', 10)]);
    await h.queue.enqueue('P', [pick('a.png', 10)]);
    assert.deepEqual(h.calls.map((c) => c.path), ['P/a 2.png', 'P/a 3.png']);
  });

  it('reports what it left out and queues nothing when nothing is left', async () => {
    const h = harness();
    const skipped = await h.queue.enqueue('P', [pick('clip.mp4', 10), pick('big.png', 11 * 1024 * 1024)]);
    assert.deepEqual(skipped.map((s) => s.name), ['clip.mp4', 'big.png']);
    assert.deepEqual(h.shown(), []);
    assert.equal(h.calls.length, 0);
  });

  it('reset stops everything', async () => {
    const h = harness();
    await h.queue.enqueue('P', [pick('a.png', 10)]);
    h.queue.reset();
    assert.equal(h.calls[0]!.signal.aborted, true);
    assert.deepEqual(h.shown(), []);
  });
});
