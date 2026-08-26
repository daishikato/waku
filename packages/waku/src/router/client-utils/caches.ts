// Layer-1 router caches as module state: prefetch manager, static-path set,
// and the rscParams identity map. Bindings read through capabilities
// (hasCachedShell, getPrefetchedElements) and never hold the stores.
// createCaches() is the test factory; production uses the module singleton.

import { unstable_fetchRsc as fetchRsc } from '../../minimal/client.js';
import {
  encodeRoutePath,
  getRouteSlotId,
} from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  type PrefetchEntry,
  type PrefetchOptions,
  createPrefetchManager,
} from './prefetch-cache.js';
import {
  canCommitInstantly,
  getRouteFromElements,
  isStaticFromElements,
} from './router-state.js';
// meta / canCommitInstantly live here; RouterState stays with the history
// binding when this file splits

type Elements = Record<string | symbol, unknown>;

export type { PrefetchOptions } from './prefetch-cache.js';

// the binding adopts the in-flight promise and subscribes to invalidation;
// expireAt stays inside the manager
export type PrefetchHandle = Pick<PrefetchEntry, 'promise' | 'onInvalidate'>;

// main.react-server.ts re-exports this module; writes must not run there
const warnClientWriteOnServer = (caller: string): void => {
  if (import.meta.env.DEV && typeof window === 'undefined') {
    console.warn(
      `caches.${caller}: client-only write evaluated in a server environment`,
    );
  }
};

export const createCaches = () => {
  const manager = createPrefetchManager();
  const staticPathSet = new Set<string>();
  let savedRscParams: [query: string, rscParams: URLSearchParams] | undefined;

  const createRscParams = (query: string): URLSearchParams => {
    if (savedRscParams && savedRscParams[0] === query) {
      return savedRscParams[1];
    }
    const rscParams = new URLSearchParams({ query });
    savedRscParams = [query, rscParams];
    return rscParams;
  };

  const getPrefetchedElements = (route: RouteProps): Elements | undefined =>
    manager.getElements(encodeRoutePath(route.path));

  return {
    prefetchRoute: (route: RouteProps, options?: PrefetchOptions): void => {
      warnClientWriteOnServer('prefetchRoute');
      if (staticPathSet.has(route.path)) {
        return;
      }
      const rscPath = encodeRoutePath(route.path);
      manager.prefetch(
        rscPath,
        route.query,
        (base, invalidate) =>
          fetchRsc(rscPath, createRscParams(route.query), {
            ...(base ? { unstable_base: base } : {}),
            onBuildIdMismatch: () => {
              invalidate();
              manager.clear();
            },
          }),
        options,
      );
    },
    hasCachedShell: (
      route: RouteProps,
      currentElements: Record<string, unknown>,
    ): boolean =>
      canCommitInstantly(
        getRouteSlotId(route.path),
        currentElements,
        getPrefetchedElements(route),
      ),
    getPrefetchedElements,
    // until the loader extract
    getPrefetch: (route: RouteProps): PrefetchHandle | undefined =>
      manager.get(encodeRoutePath(route.path), route.query),
    hasStaticPath: (path: string): boolean => staticPathSet.has(path),
    learnStaticFromElements: (elements: Record<string, unknown>): void => {
      warnClientWriteOnServer('learnStaticFromElements');
      const route = getRouteFromElements(elements);
      if (route && isStaticFromElements(elements)) {
        staticPathSet.add(route.path);
      }
    },
    createRscParams,
    clear: (): void => {
      warnClientWriteOnServer('clear');
      manager.clear();
      staticPathSet.clear();
      savedRscParams = undefined;
    },
  };
};

export type Caches = ReturnType<typeof createCaches>;

const singleton = createCaches();

export const prefetchRoute = (
  route: RouteProps,
  options?: PrefetchOptions,
): void => singleton.prefetchRoute(route, options);

export const hasCachedShell = (
  route: RouteProps,
  currentElements: Record<string, unknown>,
): boolean => singleton.hasCachedShell(route, currentElements);

export const getPrefetchedElements = (
  route: RouteProps,
): Elements | undefined => singleton.getPrefetchedElements(route);

export const getPrefetch = (route: RouteProps): PrefetchHandle | undefined =>
  singleton.getPrefetch(route);

export const hasStaticPath = (path: string): boolean =>
  singleton.hasStaticPath(path);

export const learnStaticFromElements = (
  elements: Record<string, unknown>,
): void => singleton.learnStaticFromElements(elements);

export const createRscParams = (query: string): URLSearchParams =>
  singleton.createRscParams(query);

export const clearCaches = (): void => {
  singleton.clear();
};
