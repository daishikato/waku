'use client';

/**
 * Binding-author surface for the client router toolkit. App code keeps using
 * `waku/router/client`. This module never re-exports history-binding private
 * state (`changeRoute`, instant, or the router-state symbol).
 *
 * Naming follows CONTRIBUTING.md: `_UNSTABLE` on React components and hooks,
 * `Unstable_` on types, `unstable_` on other values and functions. Nothing
 * here is settled.
 */

/**
 * In-flight prefetch: the elements promise plus an invalidation subscribe.
 * `expireAt` is not exposed — it stays inside the manager.
 */
export type { PrefetchHandle as Unstable_PrefetchHandle } from './client-core-utils/caches.js';

/**
 * Prefetch knobs. `mode` defaults to TTL-only dedupe (`'always'`); `'once'`
 * also skips if that path was already stored. `ttl` is milliseconds.
 */
export type { PrefetchOptions as Unstable_PrefetchOptions } from './client-core-utils/caches.js';

/**
 * Drop every prefetched route and the static-path set. Does not unregister
 * lazy slices — HMR still needs that set after a cache drop. No-op-warns if
 * evaluated on the server in development.
 */
export { clearCaches as unstable_clearCaches } from './client-core-utils/caches.js';

/**
 * `URLSearchParams` for a route `query` string. The same query string reuses
 * the previous object so RSC fetches keep a stable params identity.
 *
 * @param query - Already-encoded search string, without `?`.
 */
export { createRscParams as unstable_createRscParams } from './client-core-utils/caches.js';

/**
 * In-flight prefetch handle for a route, if one is still live. Bindings use
 * `promise` as the instant `adopt` payload and `onInvalidate` to subscribe
 * to eviction. `expireAt` stays inside the manager.
 */
export { getPrefetch as unstable_getPrefetch } from './client-core-utils/caches.js';

/**
 * Snapshot of prefetched elements for `route`, or `undefined` if none. Used as
 * SWR `base` for instant paint. Not the cache store itself.
 */
export { getPrefetchedElements as unstable_getPrefetchedElements } from './client-core-utils/caches.js';

/**
 * Whether `route` can paint instantly: the current tree or a prefetch snapshot
 * has an immutable shell for that route slot. Pass the elements currently on
 * screen; a boolean-only API cannot supply the SWR base.
 *
 * @param route - Destination to test.
 * @param currentElements - Resolved elements of the visible tree.
 */
export { hasCachedShell as unstable_hasCachedShell } from './client-core-utils/caches.js';

/**
 * Whether `path` has been taught static from a previous response. `load`
 * reuses the current tree for a static path instead of fetching.
 */
export { hasStaticPath as unstable_hasStaticPath } from './client-core-utils/caches.js';

/**
 * If `elements` carry a static route, remember that path so later navigations
 * skip the fetch. Call after a loaded response is committed.
 */
export { learnStaticFromElements as unstable_learnStaticFromElements } from './client-core-utils/caches.js';

/**
 * Warm the prefetch cache for `route`. Skips paths already known static.
 * `options.mode` is `'always'` (TTL dedupe, default) or `'once'` (also skip if
 * that path was stored). `options.ttl` defaults to the manager's TTL.
 */
export { prefetchRoute as unstable_prefetchRoute } from './client-core-utils/caches.js';

/**
 * Record a lazy slice id so HMR can refetch it after `unstable_clearCaches`.
 * The returned cleanup is a no-op: slice elements stay cached after unmount.
 *
 * @returns Unsubscribe that does not drop the id.
 */
export { registerLazySlice as unstable_registerLazySlice } from './client-core-utils/caches.js';

/**
 * The route the server rendered, from the `ROUTE` element, or `undefined` if
 * the record has no route meta. Hash is always `''` — the client owns hash.
 */
export { getRouteFromElements as unstable_getRouteFromElements } from './client-core-utils/element-meta.js';

/**
 * Whether the elements record includes a custom 404 route.
 */
export { has404FromElements as unstable_has404FromElements } from './client-core-utils/element-meta.js';

/**
 * Whether the elements record is marked static (`IS_STATIC`).
 */
export { isStaticFromElements as unstable_isStaticFromElements } from './client-core-utils/element-meta.js';

/**
 * Catches errors from its children and replaces the tree with a full-document
 * fallback (`<html>…</html>`). Use it at the document root (the default root
 * layout does); wrapping a nested subtree would nest a second document.
 *
 * @param props.children - Tree to guard.
 */
export { ErrorBoundary as ErrorBoundary_UNSTABLE } from './client-core-utils/error-boundary.js';

/**
 * React context for {@link Unstable_RouterHost}. Bindings provide the value;
 * toolkit hooks consume it. `null` outside a provider.
 */
export { RouterHostContext as unstable_RouterHostContext } from './client-core-utils/host.js';

/**
 * Current route plus `navigate`. Bindings must provide both keys and nothing
 * else. `reload` is not on this contract: there is no refetch bit, and a
 * same-route `navigate` would no-op, so reload stays on the history binding.
 */
export type { RouterHost as Unstable_RouterHost } from './client-core-utils/host.js';

/**
 * Read the {@link Unstable_RouterHost} provided by the enclosing binding.
 * Toolkit hooks (`useParams_UNSTABLE`, `useSearch_UNSTABLE`,
 * `useSetSearch_UNSTABLE`) go through this; they never read history or the
 * Navigation API themselves. Not `useRouter` — that stays on the history
 * binding.
 *
 * @returns The host `{ route, navigate }`. `navigate` is the binding's
 *   implementation (history or Navigation API).
 * @throws If no provider is in the tree (`Missing RouterHost`).
 */
export { useRouterHost as useRouterHost_UNSTABLE } from './client-core-utils/host.js';

/**
 * Options for {@link unstable_load}.
 *
 * - `signal` — abort the in-flight attempt (and follow-up fetches).
 * - `refetch` — `false` skips the first-attempt fetch (static reuse). Omit or
 *   `true` to fetch.
 * - `adopt` — promise whose resolution is attempt 0's elements. The binding
 *   uses this for instant overlay/swr refetch so `load` does not fetch twice.
 *   Follow attempts always fetch. Overlay/swr must not be passed to `load`;
 *   they are merge options and would make the loader write the store.
 * - `onBuildIdMismatch` / `onInvalidate` — build-id reload and prefetch
 *   eviction. The binding typically reloads the document.
 * - `has404` — whether a custom 404 route exists, so a missing path can follow.
 * - `settled` — route already on screen, used to detect same-RSC reuse.
 * - `base` — current elements as the etag fetch base. Not a store write.
 * - `url` / `follows` — override the first attempt's URL and follow count
 *   (bindings that resume after a paint).
 */
export type { LoadOptions as Unstable_LoadOptions } from './client-core-utils/load.js';

/**
 * Result of {@link unstable_load}. Discriminant is `type`:
 *
 * - `loaded` — `elements` ready. `adopted: true` means the binding already
 *   wrote the store via its overlay/swr refetch; do **not** apply a merge
 *   patch (that is the double-merge bug). `follows` is the number of
 *   redirects/404s taken, including the successful attempt.
 * - `reused` — no fetch (static path, or `refetch: false` on attempt 0).
 * - `external` — leave the app (`window.location` replace). `from` is the
 *   last in-app URL so the binding can commit history before leaving.
 * - `failed` — unrecoverable error. `restoreMeta` is always `false` here;
 *   a binding that painted instantly ORs in its own `painted` flag.
 * - `aborted` — `signal` fired; the binding should do nothing.
 */
export type { LoadOutcome as Unstable_LoadOutcome } from './client-core-utils/load.js';

/**
 * Successful {@link Unstable_LoadOutcome} (`type: 'loaded'`).
 */
export type { Loaded as Unstable_Loaded } from './client-core-utils/load.js';

/**
 * Store-free route loader: fetch the destination, follow in-app redirects and
 * 404s, honor abort. Never calls `mergeElements` and never takes overlay/swr
 * — the binding commits with {@link unstable_buildMergePatch}, or skips the
 * patch when `loaded.adopted` is true.
 *
 * Instant: the binding paints with its own `refetch(..., { overlay, swr })`
 * and passes that promise as `adopt`. Attempt 0 awaits it; later follows
 * fetch normally.
 *
 * @param requested - Route the user asked for (path / query / hash).
 * @param opts - See {@link Unstable_LoadOptions}.
 * @returns A {@link Unstable_LoadOutcome}. Check `type` before committing.
 *
 * @example
 * ```ts
 * const outcome = await unstable_load(next, {
 *   signal: event.signal,
 *   has404,
 *   settled,
 *   base: currentElements,
 * });
 * if (outcome.type === 'loaded' && !outcome.adopted) {
 *   await mergeElements(unstable_buildMergePatch(outcome, current, base, { settled }));
 * }
 * ```
 */
export { load as unstable_load } from './client-core-utils/load.js';

/**
 * Store-free commit patch: which keys from a loaded response may land when a
 * server action may have merged newer values while this fetch was in flight.
 * The binding applies the result with `mergeElements` and may add
 * binding-private keys (router state). Never includes the router-state
 * symbol. Always copies `ROUTE` / `HAS404` / `IS_STATIC` when present.
 *
 * Skip this on an adopted instant landing — SWR already wrote the settled
 * payload.
 *
 * @param outcome - `route` and `elements` from a `loaded` result.
 * @param current - Elements on screen now.
 * @param base - Elements at fetch start (etag base).
 * @param opts.settled - Route that was committed when the fetch started.
 */
export { buildMergePatch as unstable_buildMergePatch } from './client-core-utils/merge-patch.js';

/**
 * Provide search codecs to {@link useSearch_UNSTABLE},
 * {@link useSetSearch_UNSTABLE}, and href builders. Render in a module that
 * runs on every page (typically the root layout) so codecs exist in SSR and
 * the browser. Pass only codecs: a codec-only module, a record, or an array.
 * Non-codec values are ignored with a warning; duplicate ids throw.
 *
 * @param props.searchCodecs - Codec-only module, record, or array.
 * @param props.children - Tree that may read typed search.
 */
export { Unstable_SearchCodecsProvider as SearchCodecsProvider_UNSTABLE } from './client-core-utils/route-hooks.js';

/**
 * Params for the current path, typed from `from`, or `null` when the path
 * does not match. Re-renders when the route path changes. The object identity
 * changes on navigation; read fields rather than using it as an effect
 * dependency.
 *
 * Requires {@link unstable_RouterHostContext}.
 *
 * @param opts.from - Route path pattern whose slugs to parse.
 * @returns Typed params, or `null` when the current path does not match.
 */
export { useParams_UNSTABLE } from './client-core-utils/route-hooks.js';

/**
 * Resolve the search codec registered for a route path, using
 * {@link SearchCodecsProvider_UNSTABLE} and the server-shipped
 * route→codec-id map. Bindings use this when building hrefs that include
 * typed `search`.
 *
 * @returns The codec, or `undefined` if the path has none or no provider
 *   supplied it.
 */
export { useResolveSearchCodec as useResolveSearchCodec_UNSTABLE } from './client-core-utils/route-hooks.js';

/**
 * Typed `search` for the current route, parsed with the route's codec, or
 * `null` when `from` does not match or has no codec. Re-renders when the
 * query string changes.
 *
 * Requires {@link SearchCodecsProvider_UNSTABLE} and
 * {@link unstable_RouterHostContext}.
 *
 * @param opts.from - Route path whose codec to use.
 * @returns Parsed search, or `null`.
 */
export { useSearch_UNSTABLE } from './client-core-utils/route-hooks.js';

/**
 * Setter for the current route's `search`. Accepts a partial or an updater,
 * serializes with the route's codec, and navigates to the same path (push by
 * default). No-op when `from` does not match or has no codec.
 *
 * Requires {@link SearchCodecsProvider_UNSTABLE} and
 * {@link unstable_RouterHostContext}.
 *
 * @param opts.from - Route path whose codec to use.
 * @returns A setter `(update, options?) => Promise<void>`. `options.history`
 *   is `'push'` or `'replace'`; `options.scroll` defaults to `false`.
 */
export { useSetSearch_UNSTABLE } from './client-core-utils/route-hooks.js';

/**
 * In development, subscribe to RSC reload: clear route caches, refetch the
 * settled route, and refetch every registered lazy slice with `replace`.
 * Production is a no-op (`import.meta.hot` is absent). Call once per tree.
 *
 * @param getSettledRoute - Route to refetch after the cache drop.
 * @param onBeforeRefetch - Optional hook the binding uses to drop its own
 *   transient state before the refetch.
 */
export { useHmrRefetch as useHmrRefetch_UNSTABLE } from './client-core-utils/route-state-hooks.js';

/**
 * Initial route for a client tree. `initialRoute` is the server-rendered
 * path/query with an empty hash (hydration-stable). `routeFallback` fills in
 * `window.location.hash` after mount. Pass the URL the binding parsed from
 * the document as `fallbackRoute` for the first paint before elements arrive.
 *
 * @param fallbackRoute - Route parsed from the current document URL.
 */
export { useInitialRoute as useInitialRoute_UNSTABLE } from './client-core-utils/route-state-hooks.js';

/**
 * Browser URL for a route, including the configured base path. Uses
 * `window.location` as the origin/base.
 */
export { getRouteUrl as unstable_getRouteUrl } from './client-core-utils/route-url.js';

/**
 * Whether two routes are the same location for the address bar: path, query,
 * and hash all match. Use {@link unstable_isSameRscRoute} when comparing RSC
 * identity (hash is client-only and ignored there).
 */
export { isSameRoute as unstable_isSameRoute } from './client-core-utils/route-url.js';

/**
 * Path and query match; hash is ignored. RSC identity for etag / follow
 * reuse — hash is client-only.
 */
export { isSameRscRoute as unstable_isSameRscRoute } from './client-core-utils/route-url.js';

/**
 * Parse a URL into `{ path, query, hash }`, stripping the configured base
 * path. `query` is `URLSearchParams.toString()` (no leading `?`).
 */
export { parseRoute as unstable_parseRoute } from './client-core-utils/route-url.js';

/**
 * Render a named slice slot from the current RSC elements. With `lazy`, the
 * first visit fetches the slice if it is missing or mutable; later visits
 * reuse an immutable copy. The lazy `fallback` is shown only while the slot
 * is absent (it does not reappear on a later refetch).
 *
 * Requires a minimal `Root` / elements store in the tree. `children` render
 * inside the slot once it is present.
 *
 * @param props.id - Slice id as registered on the server (no leading `/`).
 * @param props.lazy - When true, `fallback` is required.
 * @param props.fallback - Shown only while the slice slot is missing from
 *   the elements map. Ignored after the first successful fetch.
 * @param props.children - Content composed into the slice slot.
 */
export { Slice as Slice_UNSTABLE } from './client-core-utils/slice.js';

/**
 * Server-registered slice id (no leading `/`).
 */
export type { SliceId as Unstable_SliceId } from './client-core-utils/slice.js';

/**
 * Typed params object for a route path pattern, inferred from create-pages
 * config. Empty object when the path has no slugs.
 */
export type { RouteParams as Unstable_RouteParams } from './create-pages-utils/inferred-path-types.js';

/**
 * Typed search object for a route path, inferred from the route's search
 * codec. `undefined` when the path has no codec.
 */
export type { RouteSearch as Unstable_RouteSearch } from './create-pages-utils/inferred-path-types.js';

/**
 * Build an href from a route path, params, optional typed `search`, and hash.
 * Route groups are stripped; params are URL-encoded; a pathname the pattern
 * would not match throws. Serializing `search` requires a codec resolver
 * (typically {@link useResolveSearchCodec_UNSTABLE}).
 *
 * @param target - `{ to, params?, search?, hash? }`.
 * @param resolveCodec - Optional `(routePath) => codec`. Required when
 *   `search` is set.
 */
export { buildRouteHref as unstable_buildRouteHref } from './isomorphic-utils/build-route-href.js';

/**
 * Argument to {@link unstable_buildRouteHref}: path plus params/search/hash.
 * `params` is required iff the path has slugs.
 */
export type { BuildRouteHrefTarget as Unstable_BuildRouteHrefTarget } from './isomorphic-utils/build-route-href.js';

/**
 * App href string (path, optional query and hash). Constrained to configured
 * routes when typegen has run.
 */
export type { RouteHref as Unstable_RouteHref } from './isomorphic-utils/build-route-href.js';

/**
 * Configured route path pattern (`/`, `/blog/[slug]`, …).
 */
export type { RoutePath as Unstable_RoutePath } from './isomorphic-utils/build-route-href.js';

/**
 * Match a concrete pathname against a route path and return its params, or
 * `null` when it does not match. Inverse of {@link unstable_buildRouteHref}.
 * The pathname must be the encoded form the router stores; malformed
 * percent-encoding yields `null` rather than throwing (this runs during
 * render).
 */
export { matchRouteParams as unstable_matchRouteParams } from './isomorphic-utils/match-route-params.js';

/**
 * Elements-map key for whether a custom 404 route exists.
 */
export { HAS404_ID as unstable_HAS404_ID } from './isomorphic-utils/route-path.js';

/**
 * Elements-map key for whether the rendered route is static.
 */
export { IS_STATIC_ID as unstable_IS_STATIC_ID } from './isomorphic-utils/route-path.js';

/**
 * Elements-map key for `[path, query]` the server rendered.
 */
export { ROUTE_ID as unstable_ROUTE_ID } from './isomorphic-utils/route-path.js';

/**
 * Path, query string, and hash. `query` has no leading `?`. Hash includes
 * `#` when present, or is `''`.
 */
export type { RouteProps as Unstable_RouteProps } from './isomorphic-utils/route-path.js';

/**
 * Decode an RSC path produced by {@link unstable_encodeRoutePath} back to a
 * route path. Throws if the string is not a route RSC path.
 */
export { decodeRoutePath as unstable_decodeRoutePath } from './isomorphic-utils/route-path.js';

/**
 * Decode an RSC path produced by {@link unstable_encodeSliceId}. Returns
 * `null` if the string is not a slice RSC path.
 */
export { decodeSliceId as unstable_decodeSliceId } from './isomorphic-utils/route-path.js';

/**
 * Encode a route path for an RSC request (`R/…`). Throws if the path lacks a
 * leading `/`, or ends with `/` or `/index.html` (except `/` itself).
 */
export { encodeRoutePath as unstable_encodeRoutePath } from './isomorphic-utils/route-path.js';

/**
 * Encode a slice id for an RSC request (`S/…`). Throws if the id starts with
 * `/`. One slice per request — prefer sending slices with the route.
 */
export { encodeSliceId as unstable_encodeSliceId } from './isomorphic-utils/route-path.js';

/**
 * Slot ids for a route path: `root`, each ancestor `layout`, and the `page`.
 */
export { getComponentIds as unstable_getComponentIds } from './isomorphic-utils/route-path.js';

/**
 * Elements-map / Slot id for a route path (`route:` + path).
 */
export { getRouteSlotId as unstable_getRouteSlotId } from './isomorphic-utils/route-path.js';

/**
 * Elements-map / Slot id for a slice (`slice:` + id).
 */
export { getSliceSlotId as unstable_getSliceSlotId } from './isomorphic-utils/route-path.js';

/**
 * Whether `slotId` is a route slot (`route:` prefix).
 */
export { isRouteSlotId as unstable_isRouteSlotId } from './isomorphic-utils/route-path.js';

/**
 * Whether `slotId` is a slice slot (`slice:` prefix).
 */
export { isSliceSlotId as unstable_isSliceSlotId } from './isomorphic-utils/route-path.js';

/**
 * Normalize a URL pathname to a route path: require a leading `/`, drop a
 * trailing slash (except `/`) and a trailing `/index.html`.
 */
export { pathnameToRoutePath as unstable_pathnameToRoutePath } from './isomorphic-utils/route-path.js';

/**
 * Look up the search-codec id the server registered for `routePath`, from
 * `globalThis.__WAKU_ROUTER_SEARCH_CODECS__`. `undefined` if none.
 */
export { getRouteSearchCodecId as unstable_getRouteSearchCodecId } from './isomorphic-utils/search-codec-registry.js';

/**
 * Whether `value` is a search codec (`id`, `parse`, `serialize`).
 */
export { isCodec as unstable_isCodec } from './isomorphic-utils/search-codec-registry.js';

/**
 * Search codec without a specific `Search` type parameter.
 */
export type { AnyCodec as Unstable_AnyCodec } from './isomorphic-utils/search-codec-registry.js';

/**
 * Bring-your-own search-params codec: `parse` turns the URL query string into
 * a typed object (may throw → 400); `serialize` must return an already
 * encoded query string placed after `?` as-is. `id` is stable across the app.
 */
export type { Unstable_SearchCodec } from './isomorphic-utils/search-codec-registry.js';
