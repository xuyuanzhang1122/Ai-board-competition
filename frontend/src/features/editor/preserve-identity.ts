/**
 * Return the previous array reference when the freshly fetched one is
 * structurally equal, so downstream `useMemo`/`useCallback`/`useEffect`
 * dependencies that compare by reference do not churn.
 *
 * Why this matters: store fetches (`fetchCharacters`/`fetchScenes`/`fetchProps`)
 * allocate a brand-new array on every call. The asset-edit panel derives
 * `sameNameAssetIds` from those arrays and feeds it into `loadHistory`, which in
 * turn refetches them — an infinite "load → refetch → re-render → load" cycle.
 * Preserving identity for unchanged data breaks that cycle at the source.
 */
export function preserveArrayIdentity<T>(prev: T[], next: T[]): T[] {
  if (prev === next) return prev
  if (prev.length !== next.length) return next
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
}
