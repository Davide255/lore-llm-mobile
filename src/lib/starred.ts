/** A copy with the starred items first; each group keeps its original order. */
export function starredFirst<T>(items: readonly T[], isStarred: (item: T) => boolean): T[] {
  const starred: T[] = [];
  const rest: T[] = [];
  for (const item of items) (isStarred(item) ? starred : rest).push(item);
  return [...starred, ...rest];
}
