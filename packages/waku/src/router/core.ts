'use client';

/**
 * Binding-author surface for the router toolkit (layer 1). Every export is
 * `unstable_` / `Unstable_` — the prefix is the stability dial; nothing here
 * is settled. App code keeps using `waku/router/client`. This module never
 * re-exports history-binding private state (`router-state`, `changeRoute`,
 * instant).
 */

export {
  clearCaches as unstable_clearCaches,
  createRscParams as unstable_createRscParams,
  getPrefetch as unstable_getPrefetch,
  getPrefetchedElements as unstable_getPrefetchedElements,
  hasCachedShell as unstable_hasCachedShell,
  hasStaticPath as unstable_hasStaticPath,
  learnStaticFromElements as unstable_learnStaticFromElements,
  prefetchRoute as unstable_prefetchRoute,
  registerLazySlice as unstable_registerLazySlice,
} from './core-utils/caches.js';
export type {
  PrefetchHandle as Unstable_PrefetchHandle,
  PrefetchOptions as Unstable_PrefetchOptions,
} from './core-utils/caches.js';

export {
  getRouteFromElements as unstable_getRouteFromElements,
  has404FromElements as unstable_has404FromElements,
  isStaticFromElements as unstable_isStaticFromElements,
} from './core-utils/element-meta.js';

export { ErrorBoundary as unstable_ErrorBoundary } from './core-utils/error-boundary.js';

export {
  RouterHostContext as unstable_RouterHostContext,
  useRouterHost as unstable_useRouterHost,
} from './core-utils/host.js';
export type { RouterHost as Unstable_RouterHost } from './core-utils/host.js';

/**
 * Store-free route loader: fetch, follow, and abort. Never writes the element
 * store and never takes overlay/swr — the binding commits via
 * `unstable_buildMergePatch` (or, for instant, via its own adopted refetch).
 */
export { load as unstable_load } from './core-utils/load.js';
export type {
  LoadOptions as Unstable_LoadOptions,
  LoadOutcome as Unstable_LoadOutcome,
  Loaded as Unstable_Loaded,
} from './core-utils/load.js';

export { buildMergePatch as unstable_buildMergePatch } from './core-utils/merge-patch.js';

export {
  Unstable_SearchCodecsProvider as unstable_SearchCodecsProvider,
  useParams_UNSTABLE as unstable_useParams,
  useResolveSearchCodec as unstable_useResolveSearchCodec,
  useSearch_UNSTABLE as unstable_useSearch,
  useSetSearch_UNSTABLE as unstable_useSetSearch,
} from './core-utils/route-hooks.js';

export {
  useHmrRefetch as unstable_useHmrRefetch,
  useInitialRoute as unstable_useInitialRoute,
} from './core-utils/route-state-hooks.js';

export {
  getRouteUrl as unstable_getRouteUrl,
  isSameRoute as unstable_isSameRoute,
  isSameRscRoute as unstable_isSameRscRoute,
  parseRoute as unstable_parseRoute,
} from './core-utils/route-url.js';

export { Slice as unstable_Slice } from './core-utils/slice.js';
export type { SliceId as Unstable_SliceId } from './core-utils/slice.js';

export type {
  RouteParams as Unstable_RouteParams,
  RouteSearch as Unstable_RouteSearch,
} from './create-pages-utils/inferred-path-types.js';

export { buildRouteHref as unstable_buildRouteHref } from './isomorphic-utils/build-route-href.js';
export type {
  BuildRouteHrefTarget as Unstable_BuildRouteHrefTarget,
  RouteHref as Unstable_RouteHref,
  RoutePath as Unstable_RoutePath,
} from './isomorphic-utils/build-route-href.js';

export { matchRouteParams as unstable_matchRouteParams } from './isomorphic-utils/match-route-params.js';

export {
  HAS404_ID as unstable_HAS404_ID,
  IS_STATIC_ID as unstable_IS_STATIC_ID,
  ROUTE_ID as unstable_ROUTE_ID,
  decodeRoutePath as unstable_decodeRoutePath,
  decodeSliceId as unstable_decodeSliceId,
  encodeRoutePath as unstable_encodeRoutePath,
  encodeSliceId as unstable_encodeSliceId,
  getComponentIds as unstable_getComponentIds,
  getRouteSlotId as unstable_getRouteSlotId,
  getSliceSlotId as unstable_getSliceSlotId,
  isRouteSlotId as unstable_isRouteSlotId,
  isSliceSlotId as unstable_isSliceSlotId,
  pathnameToRoutePath as unstable_pathnameToRoutePath,
} from './isomorphic-utils/route-path.js';
export type { RouteProps as Unstable_RouteProps } from './isomorphic-utils/route-path.js';

export {
  getRouteSearchCodecId as unstable_getRouteSearchCodecId,
  isCodec as unstable_isCodec,
} from './isomorphic-utils/search-codec-registry.js';
export type {
  AnyCodec as Unstable_AnyCodec,
  Unstable_SearchCodec,
} from './isomorphic-utils/search-codec-registry.js';
