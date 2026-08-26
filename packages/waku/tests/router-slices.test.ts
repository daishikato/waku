/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unstable_fetchRsc as fetchRsc } from '../src/minimal/client.js';
import { clearCaches } from '../src/router/client-utils/caches.js';
import {
  clearSlices,
  finishSliceFetch,
  forEachRegisteredLazySlice,
  getFetchingSliceCount,
  isCurrentSliceFetch,
  registerLazySlice,
  startSliceFetch,
} from '../src/router/client-utils/slices.js';

vi.mock('../src/minimal/client.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/minimal/client.js')>();
  return {
    ...actual,
    unstable_fetchRsc: vi.fn(),
  };
});

describe('registerLazySlice', () => {
  afterEach(() => {
    clearSlices();
    clearCaches();
    vi.mocked(fetchRsc).mockReset();
  });

  it('records ids and does not drop them on clearCaches', () => {
    registerLazySlice('a');
    registerLazySlice('a');
    registerLazySlice('b');
    const seen: string[] = [];
    forEachRegisteredLazySlice((id) => seen.push(id));
    expect(seen.sort()).toEqual(['a', 'b']);
    clearCaches();
    const after: string[] = [];
    forEachRegisteredLazySlice((id) => after.push(id));
    expect(after.sort()).toEqual(['a', 'b']);
  });

  it('startSliceFetch dedupes until finish, and replace supersedes', async () => {
    const first = Promise.resolve({ n: 1 });
    const second = Promise.resolve({ n: 2 });
    expect(startSliceFetch('s', () => first)).toBe(first);
    expect(startSliceFetch('s', () => second)).toBeUndefined();
    expect(getFetchingSliceCount()).toBe(1);
    expect(isCurrentSliceFetch('s', first)).toBe(true);
    finishSliceFetch('s', first);
    expect(getFetchingSliceCount()).toBe(0);

    const third = Promise.resolve({ n: 3 });
    const fourth = Promise.resolve({ n: 4 });
    expect(startSliceFetch('s', () => third)).toBe(third);
    expect(startSliceFetch('s', () => fourth, { replace: true })).toBe(fourth);
    expect(isCurrentSliceFetch('s', third)).toBe(false);
    expect(isCurrentSliceFetch('s', fourth)).toBe(true);
    finishSliceFetch('s', third);
    expect(getFetchingSliceCount()).toBe(1);
    finishSliceFetch('s', fourth);
    expect(getFetchingSliceCount()).toBe(0);
  });

  it('does not invoke start while a fetch for that id is in flight', () => {
    const start = vi.fn(() => Promise.resolve({}));
    void startSliceFetch('s', start);
    void startSliceFetch('s', start);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('clearSlices drops registrations and in-flight fetches', () => {
    registerLazySlice('a');
    void startSliceFetch('a', () => Promise.resolve({}));
    clearSlices();
    const seen: string[] = [];
    forEachRegisteredLazySlice((id) => seen.push(id));
    expect(seen).toEqual([]);
    expect(getFetchingSliceCount()).toBe(0);
  });
});
