import type { PickedFile } from '@/lib/folder-walk';
import { percent, planUpload, type UploadPlan } from '@/lib/upload-plan';

/**
 * The uploads in flight, as the rows the folder screen shows: one per file, or one per folder
 * (its files counted together). A few files go up at a time; a row leaves the list when its upload is
 * done (the file is then in the folder), or stays with its error until retried or dismissed.
 * Free of React Native so it runs under plain node in tests; `uploads.ts` wires the real client.
 */

export interface UploadItem {
  id: string;
  /** The folder the row is shown in. */
  parent: string;
  /** The file's name, or the picked folder's. */
  name: string;
  kind: 'file' | 'folder';
  state: 'queued' | 'uploading' | 'error';
  /** Bytes sent and to send, over all the item's files. */
  sent: number;
  total: number;
  /** Files finished and in all (more than one only for a folder). */
  done: number;
  count: number;
  error?: string;
}

interface Job {
  rel: string;
  source: { uri: string; size: number };
  sent: number;
  state: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface Entry {
  item: UploadItem;
  jobs: Job[];
  abort: AbortController;
}

export interface QueueDeps {
  upload(path: string, source: { uri: string; size: number }, onProgress: (sent: number, total: number) => void, signal: AbortSignal): Promise<void>;
  listPaths(folder: string): Promise<string[]>;
  /** After the queue has gone idle with something uploaded. */
  finish(): Promise<void>;
  onChange(items: UploadItem[]): void;
  /** An item left the list because it is in the folder now (or was dismissed half done): refresh what shows it. */
  onSettled(): void;
  concurrency?: number;
}

export function createUploadQueue(deps: QueueDeps) {
  const limit = deps.concurrency ?? 3;
  const entries = new Map<string, Entry>();
  let running = 0;
  let dirty = false;
  let seq = 0;
  const shown = new Map<string, string>();

  // Copies: the rows are shown by components that must see a new object when something changed.
  const items = () => [...entries.values()].map((e) => ({ ...e.item }));

  /** Tells the UI, unless nothing it can see changed (progress is shown in whole percents). */
  function publish(force = false) {
    const key = (i: UploadItem) => `${i.state}|${percent(i.sent, i.total)}|${i.done}|${i.error ?? ''}`;
    let changed = force || shown.size !== entries.size;
    for (const { item } of entries.values()) {
      if (shown.get(item.id) !== key(item)) changed = true;
    }
    if (!changed) return;
    shown.clear();
    for (const { item } of entries.values()) shown.set(item.id, key(item));
    deps.onChange(items());
  }

  function recount(e: Entry) {
    e.item.sent = e.jobs.reduce((n, j) => n + j.sent, 0);
    e.item.done = e.jobs.filter((j) => j.state === 'done').length;
  }

  function settle(e: Entry) {
    if (!entries.has(e.item.id)) return;
    if (e.jobs.some((j) => j.state === 'queued' || j.state === 'uploading')) return;
    const failed = e.jobs.filter((j) => j.state === 'error');
    if (!failed.length) {
      entries.delete(e.item.id);
      deps.onSettled();
      return;
    }
    e.item.state = 'error';
    e.item.error =
      e.jobs.length === 1 ? failed[0]!.error : `${failed.length} file su ${e.jobs.length} non caricati: ${failed[0]!.error}`;
  }

  async function run(e: Entry, job: Job) {
    job.state = 'uploading';
    if (e.item.state !== 'error') e.item.state = 'uploading';
    publish();
    try {
      await deps.upload(
        job.rel,
        job.source,
        (sent) => {
          job.sent = Math.min(sent, job.source.size);
          recount(e);
          publish();
        },
        e.abort.signal,
      );
      job.state = 'done';
      job.sent = job.source.size;
      dirty = true;
    } catch (err) {
      job.state = 'error';
      job.error = (err as Error)?.message || 'Caricamento non riuscito';
    }
    running--;
    // Dismissed meanwhile: nothing to show, but a file that did make it should appear.
    if (!entries.has(e.item.id)) {
      if (job.state === 'done') deps.onSettled();
    } else {
      recount(e);
      settle(e);
    }
    publish();
    pump();
  }

  function pump() {
    while (running < limit) {
      let next: { e: Entry; job: Job } | undefined;
      for (const e of entries.values()) {
        const job = e.jobs.find((j) => j.state === 'queued');
        if (job && e.item.state !== 'error') {
          next = { e, job };
          break;
        }
      }
      if (!next) break;
      running++;
      void run(next.e, next.job);
    }
    if (running === 0 && dirty) {
      dirty = false;
      deps.finish().then(deps.onSettled, deps.onSettled);
    }
  }

  function add(parent: string, name: string, kind: UploadItem['kind'], files: { rel: string; source: { uri: string; size: number } }[]) {
    const id = `u${++seq}`;
    const jobs: Job[] = files.map((f) => ({ ...f, sent: 0, state: 'queued' }));
    entries.set(id, {
      item: { id, parent, name, kind, state: 'queued', sent: 0, total: jobs.reduce((n, j) => n + j.source.size, 0), done: 0, count: jobs.length },
      jobs,
      abort: new AbortController(),
    });
  }

  return {
    items,

    /**
     * Plans and queues what was picked into `parent`. Picked files become one row each; a picked
     * folder (`folder` is its name) becomes a single row. Resolves with what was left out and why.
     */
    async enqueue(parent: string, picked: PickedFile[], folder?: string): Promise<UploadPlan['skipped']> {
      const taken = new Set(await deps.listPaths(parent));
      // Names claimed by uploads still in flight count as taken too.
      for (const e of entries.values()) for (const j of e.jobs) taken.add(j.rel);
      const plan = planUpload(parent, picked, (rel) => taken.has(rel));
      const files = plan.ok.map((p) => ({ rel: p.rel, source: { uri: picked[p.index]!.uri, size: picked[p.index]!.size } }));
      if (files.length) {
        if (folder !== undefined) add(parent, folder, 'folder', files);
        else for (const f of files) add(parent, f.rel.slice(f.rel.lastIndexOf('/') + 1), 'file', [f]);
        publish(true);
        pump();
      }
      return plan.skipped;
    },

    /** Tries the files of an item that failed again. */
    retry(id: string) {
      const e = entries.get(id);
      if (!e || e.item.state !== 'error') return;
      for (const j of e.jobs) {
        if (j.state !== 'error') continue;
        j.state = 'queued';
        j.sent = 0;
        j.error = undefined;
      }
      e.item.state = 'queued';
      e.item.error = undefined;
      e.abort = new AbortController();
      recount(e);
      publish(true);
      pump();
    },

    /** Stops an upload (or clears a failed one). What already went up stays. */
    dismiss(id: string) {
      const e = entries.get(id);
      if (!e) return;
      e.abort.abort();
      entries.delete(id);
      if (e.jobs.some((j) => j.state === 'done')) deps.onSettled();
      publish(true);
      pump();
    },

    /** Another account signed in: nothing of the previous one should keep uploading. */
    reset() {
      for (const e of entries.values()) e.abort.abort();
      entries.clear();
      publish(true);
    },
  };
}
