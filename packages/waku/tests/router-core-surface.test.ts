// @vitest-environment happy-dom

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import * as client from '../src/router/client.js';
import * as core from '../src/router/core.js';

const routerSrc = join(dirname(fileURLToPath(import.meta.url)), '../src/router');

const runtimeExportNames = (ns: object): string[] =>
  Reflect.ownKeys(ns)
    .filter((key): key is string => typeof key === 'string')
    .sort();

describe('waku/router/core surface', () => {
  test('runtime export names are the frozen L1 surface', () => {
    expect(runtimeExportNames(core)).toEqual([
      'unstable_ErrorBoundary',
      'unstable_HAS404_ID',
      'unstable_IS_STATIC_ID',
      'unstable_ROUTE_ID',
      'unstable_RouterHostContext',
      'unstable_SearchCodecsProvider',
      'unstable_Slice',
      'unstable_buildMergePatch',
      'unstable_buildRouteHref',
      'unstable_clearCaches',
      'unstable_createRscParams',
      'unstable_decodeRoutePath',
      'unstable_decodeSliceId',
      'unstable_encodeRoutePath',
      'unstable_encodeSliceId',
      'unstable_getComponentIds',
      'unstable_getPrefetch',
      'unstable_getPrefetchedElements',
      'unstable_getRouteFromElements',
      'unstable_getRouteSearchCodecId',
      'unstable_getRouteSlotId',
      'unstable_getRouteUrl',
      'unstable_getSliceSlotId',
      'unstable_has404FromElements',
      'unstable_hasCachedShell',
      'unstable_hasStaticPath',
      'unstable_isCodec',
      'unstable_isRouteSlotId',
      'unstable_isSameRoute',
      'unstable_isSameRscRoute',
      'unstable_isSliceSlotId',
      'unstable_isStaticFromElements',
      'unstable_learnStaticFromElements',
      'unstable_load',
      'unstable_matchRouteParams',
      'unstable_parseRoute',
      'unstable_pathnameToRoutePath',
      'unstable_prefetchRoute',
      'unstable_registerLazySlice',
      'unstable_useHmrRefetch',
      'unstable_useInitialRoute',
      'unstable_useParams',
      'unstable_useResolveSearchCodec',
      'unstable_useRouterHost',
      'unstable_useSearch',
      'unstable_useSetSearch',
    ]);
  });

  test('every runtime export carries the unstable_ prefix', () => {
    for (const name of runtimeExportNames(core)) {
      expect(name.startsWith('unstable_')).toBe(true);
    }
  });

  test('does not export binding-private names', () => {
    const names = new Set(runtimeExportNames(core));
    expect(names.has('unstable_RouterContext')).toBe(false);
    expect(names.has('Router')).toBe(false);
    expect(names.has('Link')).toBe(false);
    expect(names.has('useRouter')).toBe(false);
    expect(names.has('changeRoute')).toBe(false);
    expect(names.has('unstable_changeRoute')).toBe(false);
  });

  test('core.ts does not import the history binding or router-state', () => {
    const src = readFileSync(join(routerSrc, 'core.ts'), 'utf8');
    const specs = [...src.matchAll(/from ['"]([^'"]+)['"]/g)].map(
      (match) => match[1]!,
    );
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(spec).not.toMatch(/client\.tsx|router-state/);
    }
  });
});

describe('waku/router/client surface', () => {
  test('runtime export names stay the pre-core app-facing set', () => {
    expect(runtimeExportNames(client)).toEqual([
      'ErrorBoundary',
      'INTERNAL_ServerRouter',
      'Link',
      'Router',
      'Slice',
      'Unstable_SearchCodecsProvider',
      'unstable_HAS404_ID',
      'unstable_IS_STATIC_ID',
      'unstable_ROUTE_ID',
      'unstable_RouterContext',
      'unstable_addBase',
      'unstable_buildRouteHref',
      'unstable_encodeRoutePath',
      'unstable_encodeSliceId',
      'unstable_getErrorInfo',
      'unstable_getRouteSlotId',
      'unstable_getSliceSlotId',
      'unstable_matchRouteParams',
      'unstable_parseRoute',
      'unstable_removeBase',
      'unstable_useResolveSearchCodec',
      'useNavigationStatus_UNSTABLE',
      'useParams_UNSTABLE',
      'useRouter',
      'useSearch_UNSTABLE',
      'useSetSearch_UNSTABLE',
    ]);
  });

  test('core aliases the same module instances as client', () => {
    expect(core.unstable_Slice).toBe(client.Slice);
    expect(core.unstable_ErrorBoundary).toBe(client.ErrorBoundary);
    expect(core.unstable_useParams).toBe(client.useParams_UNSTABLE);
    expect(core.unstable_SearchCodecsProvider).toBe(
      client.Unstable_SearchCodecsProvider,
    );
    expect(core.unstable_parseRoute).toBe(client.unstable_parseRoute);
    expect(core.unstable_HAS404_ID).toBe(client.unstable_HAS404_ID);
    expect(core.unstable_encodeRoutePath).toBe(client.unstable_encodeRoutePath);
  });
});

describe('folder membership is layer membership', () => {
  test('client-utils holds only router-state', () => {
    expect(readdirSync(join(routerSrc, 'client-utils')).sort()).toEqual([
      'router-state.ts',
    ]);
  });

  test('core-utils holds the L1 modules', () => {
    expect(readdirSync(join(routerSrc, 'core-utils')).sort()).toEqual([
      'caches.ts',
      'element-meta.ts',
      'error-boundary.tsx',
      'error-route.ts',
      'host.ts',
      'load.ts',
      'merge-patch.ts',
      'prefetch-cache.ts',
      'route-hooks.tsx',
      'route-state-hooks.ts',
      'route-url.ts',
      'scroll.ts',
      'slice.tsx',
    ]);
  });
});
