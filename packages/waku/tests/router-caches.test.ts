/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import { unstable_fetchRsc as fetchRsc } from '../src/minimal/client.js';
import {
  clearCaches,
  createCaches,
  createRscParams,
  getPrefetch,
  getPrefetchedElements,
  hasStaticPath,
  learnStaticFromElements,
  prefetchRoute,
} from '../src/router/client-utils/caches.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
  encodeRoutePath,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/route-path.js';

vi.mock('../src/minimal/client.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/minimal/client.js')>();
  return {
    ...actual,
    unstable_fetchRsc: vi.fn(),
  };
});

type Elements = Record<string, unknown>;

const route = (path: string, query = '', hash = '') => ({ path, query, hash });

const immutable = (path: string) => ({
  [ETAG_ID_PREFIX + getRouteSlotId(path)]: IMMUTABLE_ETAG,
});

const pending = () => new Promise<Elements>(() => {});

const settlePrefetch = async (
  caches: ReturnType<typeof createCaches>,
  path: string,
  query: string,
  elements: Elements,
) => {
  vi.mocked(fetchRsc).mockImplementationOnce(async () => elements);
  caches.prefetchRoute(route(path, query));
  await Promise.resolve();
  await Promise.resolve();
};

describe('layer-1 router caches', () => {
  afterEach(() => {
    clearCaches();
    vi.mocked(fetchRsc).mockReset();
    vi.useRealTimers();
  });

  it('hasCachedShell is true when the current elements hold an immutable route slot', () => {
    const caches = createCaches();
    expect(caches.hasCachedShell(route('/a'), immutable('/a'))).toBe(true);
  });

  it('hasCachedShell is true when only the prefetched elements hold the slot', async () => {
    const caches = createCaches();
    await settlePrefetch(caches, '/a', '', immutable('/a'));
    expect(caches.hasCachedShell(route('/a'), {})).toBe(true);
  });

  it('hasCachedShell is false without an immutable etag for the slot', () => {
    const caches = createCaches();
    expect(
      caches.hasCachedShell(route('/a'), {
        [ETAG_ID_PREFIX + getRouteSlotId('/a')]: 'W/"mutable"',
      }),
    ).toBe(false);
  });

  it('getPrefetchedElements is keyed by route path, encoding the rscPath internally', async () => {
    const caches = createCaches();
    const shell = { [getRouteSlotId('/next')]: 'shell' };
    await settlePrefetch(caches, '/next', 'q=a', shell);
    expect(caches.getPrefetchedElements(route('/next', 'q=b'))).toEqual(shell);
    expect(caches.getPrefetchedElements(route('/other'))).toBeUndefined();
  });

  it('returns the stored elements object, not a clone', async () => {
    const caches = createCaches();
    const shell = { [getRouteSlotId('/next')]: 'shell' };
    await settlePrefetch(caches, '/next', '', shell);
    expect(caches.getPrefetchedElements(route('/next'))).toBe(shell);
  });

  it('learnStaticFromElements records only static routes', () => {
    const caches = createCaches();
    caches.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    caches.learnStaticFromElements({
      [ROUTE_ID]: ['/dynamic', ''],
      [IS_STATIC_ID]: false,
    });
    caches.learnStaticFromElements({});
    expect(caches.hasStaticPath('/static')).toBe(true);
    expect(caches.hasStaticPath('/dynamic')).toBe(false);
  });

  it('prefetchRoute skips a path already learned as static', () => {
    const caches = createCaches();
    caches.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    caches.prefetchRoute(route('/static'));
    expect(fetchRsc).not.toHaveBeenCalled();
  });

  it('prefetchRoute fetches by encoded rscPath and reuses createRscParams identity', () => {
    vi.mocked(fetchRsc).mockImplementation(pending);
    const caches = createCaches();
    caches.prefetchRoute(route('/next', 'x=1'));
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    expect(fetchRsc).toHaveBeenCalledWith(
      encodeRoutePath('/next'),
      caches.createRscParams('x=1'),
      { onBuildIdMismatch: expect.any(Function) },
    );
  });

  it('createRscParams returns the same URLSearchParams for the same query', () => {
    const caches = createCaches();
    const first = caches.createRscParams('a=1');
    expect(caches.createRscParams('a=1')).toBe(first);
    expect(caches.createRscParams('a=2')).not.toBe(first);
  });

  it('createCaches isolates prefetch, static paths, and rscParams', async () => {
    const a = createCaches();
    const b = createCaches();
    await settlePrefetch(a, '/a', '', { a: 1 });
    a.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    const params = a.createRscParams('q=1');

    expect(b.getPrefetchedElements(route('/a'))).toBeUndefined();
    expect(b.hasStaticPath('/static')).toBe(false);
    expect(b.createRscParams('q=1')).not.toBe(params);
  });

  it('clear() detaches an in-flight prefetch and forgets static paths and rscParams', async () => {
    const caches = createCaches();
    let resolveFetch!: (elements: Elements) => void;
    vi.mocked(fetchRsc).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    caches.prefetchRoute(route('/p'));
    caches.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    const params = caches.createRscParams('q=1');
    caches.clear();
    resolveFetch({ a: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(caches.getPrefetchedElements(route('/p'))).toBeUndefined();
    expect(caches.getPrefetch(route('/p'))).toBeUndefined();
    expect(caches.hasStaticPath('/static')).toBe(false);
    expect(caches.createRscParams('q=1')).not.toBe(params);
  });

  it('getPrefetch is keyed by path and query', () => {
    const caches = createCaches();
    vi.mocked(fetchRsc).mockImplementation(pending);
    caches.prefetchRoute(route('/p', 'q=1'));
    expect(caches.getPrefetch(route('/p', 'q=1'))).toBeDefined();
    expect(caches.getPrefetch(route('/p', 'q=2'))).toBeUndefined();
  });

  it('a build-id mismatch drops the prefetch store and keeps static paths', async () => {
    const caches = createCaches();
    await settlePrefetch(caches, '/a', '', { a: 1 });
    caches.learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    vi.mocked(fetchRsc).mockImplementationOnce(pending);
    caches.prefetchRoute(route('/c'));
    const onBuildIdMismatch = vi.mocked(fetchRsc).mock.calls.at(-1)?.[2]
      ?.onBuildIdMismatch as (() => void) | undefined;
    onBuildIdMismatch?.();
    expect(caches.getPrefetchedElements(route('/a'))).toBeUndefined();
    expect(caches.getPrefetch(route('/c'))).toBeUndefined();
    expect(caches.hasStaticPath('/static')).toBe(true);
  });

  it('module functions share one store that createCaches does not see', async () => {
    vi.mocked(fetchRsc).mockResolvedValue({ shell: 1 });
    prefetchRoute(route('/x'));
    await Promise.resolve();
    await Promise.resolve();
    expect(getPrefetchedElements(route('/x'))).toEqual({ shell: 1 });
    expect(getPrefetch(route('/x', ''))).toBeDefined();
    expect(createCaches().getPrefetchedElements(route('/x'))).toBeUndefined();

    learnStaticFromElements({
      [ROUTE_ID]: ['/static', ''],
      [IS_STATIC_ID]: true,
    });
    expect(hasStaticPath('/static')).toBe(true);
    expect(createCaches().hasStaticPath('/static')).toBe(false);

    const params = createRscParams('q=1');
    expect(createRscParams('q=1')).toBe(params);

    clearCaches();
    expect(getPrefetchedElements(route('/x'))).toBeUndefined();
    expect(hasStaticPath('/static')).toBe(false);
    expect(createRscParams('q=1')).not.toBe(params);
  });
});
