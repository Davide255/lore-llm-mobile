import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Tiny stale-while-revalidate cache. Screens read through `useQuery`,
 * mutations call `invalidate` and every mounted query refetches in place.
 * Deliberately small: when the real backend lands this can be swapped for
 * TanStack Query without touching the screens (they only use src/data/hooks).
 */

interface Snapshot<T = unknown> {
  data?: T;
  error?: unknown;
  loading: boolean;
  stale: boolean;
}

const cache = new Map<string, Snapshot>();
const subscribers = new Map<string, Set<() => void>>();
const fetchers = new Map<string, () => Promise<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const EMPTY: Snapshot = { loading: true, stale: true };

function set(key: string, next: Partial<Snapshot>) {
  cache.set(key, { ...(cache.get(key) ?? EMPTY), ...next });
  subscribers.get(key)?.forEach((cb) => cb());
}

function load(key: string) {
  const fetcher = fetchers.get(key);
  if (!fetcher || inflight.has(key)) return;
  set(key, { loading: true });
  const p = fetcher()
    .then((data) => set(key, { data, error: undefined, loading: false, stale: false }))
    .catch((error) => set(key, { error, loading: false, stale: false }))
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
}

export function useQuery<T>(key: string | null, fetcher: () => Promise<T>) {
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      let set = subscribers.get(key);
      if (!set) subscribers.set(key, (set = new Set()));
      set.add(cb);
      return () => {
        set!.delete(cb);
      };
    },
    [key],
  );
  const snap = useSyncExternalStore(subscribe, () => (key ? (cache.get(key) ?? EMPTY) : EMPTY)) as Snapshot<T>;

  useEffect(() => {
    if (!key) return;
    fetchers.set(key, () => fetcherRef.current());
    const current = cache.get(key);
    if (!current || current.stale) load(key);
  }, [key]);

  const refresh = useCallback(async () => {
    if (!key) return;
    fetchers.set(key, () => fetcherRef.current());
    set(key, { stale: true });
    load(key);
    await inflight.get(key);
  }, [key]);

  return {
    data: snap.data,
    error: snap.error,
    /** True only for the first load (no data yet). */
    loading: snap.loading && snap.data === undefined,
    refreshing: snap.loading && snap.data !== undefined,
    refresh,
  };
}

/** Mark matching queries stale; mounted ones refetch immediately. */
export function invalidate(match: (key: string) => boolean = () => true) {
  for (const key of cache.keys()) {
    if (!match(key)) continue;
    set(key, { stale: true });
    if (subscribers.get(key)?.size) load(key);
  }
}

/** Forget every cached value (another account signed in). */
export function resetQueries() {
  cache.clear();
  for (const subs of subscribers.values()) subs.forEach((cb) => cb());
}

/** Optimistic local update of a cached value. */
export function setQueryData<T>(key: string, updater: (prev: T | undefined) => T) {
  set(key, { data: updater(cache.get(key)?.data as T | undefined) });
}

// ─── Small observable for non-query UI state ─────────────────────────────────

export function createSignal<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      subs.forEach((s) => s());
    },
    // Not named `use`: the React Compiler treats `x.use()` like React's `use()`
    // (callable conditionally) and may skip it, breaking hook order.
    useValue(): T {
      return useSyncExternalStore(
        (cb) => {
          subs.add(cb);
          return () => {
            subs.delete(cb);
          };
        },
        () => value,
      );
    },
  };
}
