// Ids persist after unmount (slice elements stay cached). clearCaches
// does not touch this: HMR snapshots the set, then refetches.

type Elements = Record<string | symbol, unknown>;

const lazySliceIds = new Set<string>();
const fetchingSlices = new Map<string, Promise<Elements>>();

export const registerLazySlice = (id: string): void => {
  lazySliceIds.add(id);
};

export const forEachRegisteredLazySlice = (fn: (id: string) => void): void => {
  lazySliceIds.forEach(fn);
};

export const startSliceFetch = (
  id: string,
  start: () => Promise<Elements>,
  options?: { replace?: boolean },
): Promise<Elements> | undefined => {
  if (fetchingSlices.has(id) && !options?.replace) {
    return undefined;
  }
  const request = start();
  fetchingSlices.set(id, request);
  return request;
};

export const isCurrentSliceFetch = (
  id: string,
  request: Promise<Elements>,
): boolean => fetchingSlices.get(id) === request;

export const finishSliceFetch = (
  id: string,
  request: Promise<Elements>,
): void => {
  if (fetchingSlices.get(id) === request) {
    fetchingSlices.delete(id);
  }
};

export const getFetchingSliceCount = (): number => fetchingSlices.size;

export const clearSlices = (): void => {
  lazySliceIds.clear();
  fetchingSlices.clear();
};
