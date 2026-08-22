# RFC: Two-layer router client

Status: draft. Internal re-architecture of `waku/router`'s client. No
user-facing API change by itself. Subsequent PRs move toward this
layering.

## Motivation

`src/router/client.tsx` is 1,800+ lines serving every concern at once:
navigation state machine, prefetching, redirect/404 following, history and
scroll side effects, instant paint, typed navigation sugar, and shared
components. Incremental refactoring has extracted utilities
(`client-utils/`, `isomorphic-utils/`) but the core remains a single
monolith: `changeRoute` is a ~330-line async closure coordinated through
seven mutable refs inside a 600-line component. Every reader pays for every
feature.

Meanwhile, `waku-navigation` demonstrates both the demand for an alternative
router client and the cost of not having a real layer to build on:

- It imports 18 names from the `unstable_` grab-bag at the bottom of
  `client.tsx` — a de-facto public API with no contract.
- It duplicates, in degraded form, machinery it cannot import: a prefetch
  cache without build-id invalidation, a 404-only follow (no server-redirect
  following), the static-path set, HMR wiring, and near-verbatim copies of
  the typed hooks.
- It impersonates `RouterContext` so `Slice` and the search-codec provider
  work, and the mocked shape drifts: built against beta.7, its context lacks
  `lazySliceIds`, so `Slice` crashes against current waku.

The server side already has clean layering (`createPages` is a wrapper over
`unstable_defineRouter`). The client has nothing equivalent. create-pages
is a server API; the shared client contract is **define-router** (`root` /
`route:` slots, `ROUTE` / `HAS404` / `IS_STATIC`, slices). Layer 2 does not
have to look like create-pages. A Navigation API binding may use Layer 1
only.

Do not preserve today’s `waku-navigation` `client.tsx`. Do not re-extract
pure helpers (`navigate.ts`); that already failed when elements became the
source of truth.

## Proposal

Split the router client into two layers:

- **Layer 1 — router core.** Engine-agnostic: it does not know how URL
  changes are detected or committed. Protocol vocabulary, a React-free route
  loader, caches, the host contract, shared components, and the typed hooks.
  This is the layer a rewritten `waku-navigation` builds on.
- **Layer 2 — engine bindings.** Waku ships a history/popstate binding
  (including `unstable_instant`). A rewritten `waku-navigation` is a
  Navigation API binding. Each binding owns its own control flow and event
  topology.

```
L2 bindings     history/popstate (instant lives here)
                Navigation API (waku-navigation rewrite)

L1 core         protocol, load() → LoadOutcome, caches, host contract,
                Slice, typed hooks, prefetch

                waku/minimal  (unchanged; overlay/swr already abstract)
```

### Design principles

1. **Toolkit, not framework.** Layer 1 exposes composable functions and
   small hooks; each binding is the top-level owner of its control flow and
   calls into layer 1 à la carte. There is deliberately **no driver
   interface** (no shared `Intent` vocabulary, no inversion of control, no
   `navigate()` owned by L1). An interface may be harvested later from two
   working bindings if their shapes converge; it is not designed up front.
2. **Capabilities, not storage.** The host contract and cache module expose
   what a caller can do, never internal collections. (The `lazySliceIds`
   crash is what storage-shaped contracts produce.)
3. **Caches live in layer 1** as module state, matching existing precedent
   (`savedRscParams`, minimal's SWR WeakMaps). Bindings never hold or
   manage cache stores. They call read capabilities
   (`getPrefetchedElements`, `hasCachedShell`). Consequences: prefetch is
   a plain function needing no host; HMR clearing is one exported call;
   multiple router roots share caches (correct: same app, same server).
   Cost: tests need an internal factory/reset for isolation, and the
   module must remain strictly client-side.
4. **`unstable_instant` is confined to the history binding.** The protocol,
   loader, contract, and typed shared surface never mention it. Its
   mechanism (overlay merge, SWR pinning) already lives in
   `waku/minimal/client` as generic element-store capabilities; the
   _feature_ — decision, overlay construction, transition bypass, **early
   URL commit then replace on follow** — is history-binding code.
5. **`waku/minimal` is unchanged.** Overlay/SWR options on refetch are
   already isolated and abstract; nothing below the router moves.

### Leak fence (acceptance criteria)

A step is not done if it moves a right-hand item into Layer 1.

| Layer 1 | Not Layer 1 |
| --- | --- |
| Protocol, `load()` / `LoadOutcome`, follow loop | `unstable_instant` (any flag, option, or branch) |
| Prefetch + session shell + static-path set | Skip-transition / paint-before-response |
| `getPrefetchedElements` (snapshot) + `hasCachedShell` (boolean) | Cache stores / Maps returned to bindings |
| `adopt` (in-flight elements promise on `load()`) | Overlay/swr construction, early URL paint |
| Follow + abort (`signal` accepted, not owned) | History vs Navigation control flow |
| define-router slots / meta / slices | create-pages page/layout builders, typegen |
| params / search hooks, codec resolution | `history.pushState` / `navigation.navigate` |
| `prefetchRoute({ mode, ttl })` | popstate / `navigate`-event listeners |
| contract: `{ route, navigate }` | `RouterState` commit metadata |
| | Driver / `NavigationEngine` / `Intent` / host slot for instant |

If a flag named `instant` appears on `load()` or the host `navigate`, that
is the leak. `adopt` is not. Overlay/swr passthrough would be: those
options only take effect in `mergeElements`, so forwarding them would
make the loader write the store.

Reverse: bindings never import cache stores; never write elements except
`buildMergePatch` output, binding-private keys, and the instant overlay/swr
refetch they own; the Navigation API binding contains no `unstable_instant`.

## Layer 1 API

### Protocol (isomorphic, no React)

Today's `isomorphic-utils/`, published deliberately instead of leaked:

```ts
parseRoute(url: URL): Route // { path, query, hash }
encodeRoutePath(path): string
getRouteSlotId(path) / getSliceSlotId(id)
ROUTE_ID / IS_STATIC_ID / HAS404_ID
buildRouteHref(target, resolveCodec?): string
matchRouteParams(from, path): Params | null
addBase / removeBase
getErrorInfo(err)
```

The type-only imports from `create-pages-utils` in `build-route-href.ts`
and `match-route-params.ts` are split so runtime modules carry no upward
dependency (the types collapse to `string` without user augmentation, as
today).

### Route loader (client, React-free)

Extract `changeRoute`'s `fetchRoute` + follow loop + abort handling into a
plain async function. The loader never touches the element store.

```ts
load(requested: Route, opts: {
  signal: AbortSignal;
  refetch?: boolean;
  // in-flight elements promise for attempt 0 instead of fetching.
  // the caller started it (instant paint). follow attempts fetch normally.
  adopt?: Promise<Elements>;
  onBuildIdMismatch?: (url: URL) => void;
  onInvalidate?: (url: URL) => void;
}): Promise<LoadOutcome>

type LoadOutcome =
  | { type: 'loaded'; route: Route; url: URL; elements: Elements; follows: number }
  | { type: 'reused'; route: Route; url: URL; follows: number }
  | { type: 'external'; url: URL; error: unknown }
  | { type: 'failed'; route: Route; url: URL; error: unknown; restoreMeta: boolean }
  | { type: 'aborted' }
```

Internally: prefetch-cache consultation, static-path fast path and
learning, and the redirect/404 follow loop (`decideFollow`, cap at
`MAX_FOLLOWS_PER_NAVIGATION`). The signal is _accepted_, not owned — the
history binding creates an `AbortController` per navigation; a Navigation
API binding passes `event.signal`.

The first extraction of `load()` is **behavior-identical**: server redirects
keep resolving at commit time via `RouterState` / `resolveServerRedirect`.
Eager resolution inside the loader is a follow-up PR (server-action
interleaving). `adopt` may land on the signature in the extract, unused
until the history-binding rebuild.

```ts
buildMergePatch(
  outcome: Loaded, current: Elements, base: Elements,
): Elements
```

extracts the commit reconciliation (the guard against concurrent
server-action merges). The binding decides _when_ to apply it; the loader
never touches the store.

#### `adopt` (instant attempt 0)

Today instant is one `refetch` (fetch + `mergeElements` with overlay/swr)
inside `fetchRoute`'s try (`client.tsx` ~1421). On success,
`changeRoute` **does not merge again** (`if (outcome.instant) return` ~
1553). SWR's second pass is the settled write. That split must survive
`adopt`:

- **Error shape.** `adopt` is the same promise `fetchRsc` / `checkStatus`
  would reject. `decideFollow` / `getErrorInfo` keep working. Do not adopt
  a wrapper that swallows fetch errors.
- **Abort.** The binding passes the **same** `AbortSignal` into its
  refetch and into `load()`. `load` wraps `adopt` with that signal
  (today's `abortable`). The fetch cancels; it is not orphaned.
- **Who writes the store.** Attempt 0 of an instant nav: the binding's
  minimal refetch is the **only** writer. Overlay paints immediately; SWR
  commits the settled response. `load({ adopt })` awaits for
  follow/error only — it must not `mergeElements`. On `loaded` for that
  adopted attempt, the binding skips `buildMergePatch` (same as today's
  instant return). Follow attempts (`follows > 0`) fetch through `load()`
  without `adopt` and commit via `buildMergePatch`.

Two writers on the settled payload (SWR and `buildMergePatch`) is the
double-merge bug this seam exists to prevent.

### Caches (module state, internal)

```ts
prefetchRoute(route, opts?: { mode?: 'always' | 'once'; ttl?: number }): void
getPrefetchedElements(route): Elements | undefined // snapshot, never the store
hasCachedShell(route, currentElements: Elements): boolean
clearCaches(): void
// internal: createCaches() for test isolation
```

- Prefetch manager: query-keyed TTL, size bound, build-id invalidation.
  `mode: 'always'` (default) dedupes by TTL for that path+query.
  `mode: 'once'` warms immutable slots for the `rscPath` (session shell),
  ignoring query — not an instant API.
- Static-path set: after `IS_STATIC`, later visits skip refetch.
- `getPrefetchedElements` is the general read (SWR `base` is one caller).
- `hasCachedShell` is today’s `canCommitInstantly`: true when the route
  slot is immutable in `currentElements` or in that snapshot.
- rscParams identity map, lazy-slice registrations, server-action listener
  that learns static paths.

ETags stay in minimal.

### Host contract (React context)

```ts
type RouterHost = {
  route: Route;
  navigate: (
    href: string,
    opts: { history: 'push' | 'replace'; scroll?: boolean },
  ) => Promise<void>;
};
```

That is the whole public contract. No `instant`, no overlay hooks, no
commit strategies, no opaque slot. Instant is a history-binding
`useRouter` / `Link` wrapper over a binding-private context layer 1 never
sees.

The history binding keeps **binding-private** commit metadata (today’s
`RouterState` symbol) in the elements store. A Navigation API binding
does not need `RouterState`.

### Components and hooks (contract-bound)

- `Slice` (registers lazy ids via layer-1 `registerLazySlice`),
  `Unstable_SearchCodecsProvider`, `ErrorBoundary`.
- Typed hooks: `useRouter` (core: `push` / `replace` / `reload` / `back` /
  `forward` / `prefetch` with `{ scroll }`), `useParams`, `useSearch`,
  `useSetSearch`. Waku’s layer 2 re-exports a widened `useRouter` with
  `unstable_instant`; other bindings ship the core hook.
- Shared helpers: `shouldScrollByDefault`, `shouldScrollForRouteChange`,
  `scrollToHash`, `useRouteState`, `useHmrRefetch`. Link-registry /
  optimistic pending is specified below but is a **follow-up**, not a
  rebuild dependency.

Typegen (`pages.gen.ts`) and `unstable_searchCodec` on a route stay
server/app.

## Layer 2: binding responsibilities

| Concern | History binding (waku) | Navigation API binding |
| --- | --- | --- |
| Initiation | `Link` onClick, popstate, programmatic | one `navigate` listener (filters `canIntercept`, download, formData) |
| Abort | own `AbortController`, supersede previous | `event.signal` |
| URL commit (default) | deferred to post-React-commit (`RouterState`, binding-private) | browser commits at intercept |
| Scroll | manual (`scrollToHash` + policy) | browser after handler resolves, or `scroll: 'manual'` |
| Server redirect | `replaceState` | flagged replace navigation |
| Transitions | wraps commit; re-wraps after await | same, inside intercept handler |
| `unstable_instant` | full feature lives here | absent |

Plain `<a>` without `Link` is a Navigation binding property, not Layer 1.

### Instant path (history binding)

Default: `load()` → `buildMergePatch` inside a transition → layout effect
writes history.

Instant:

1. Gate with `hasCachedShell(route, currentElements)`. If false, default
   path (including `startTransition`).
2. No outer `startTransition`.
3. Binding calls minimal refetch with overlay (`ROUTE` + commit metadata)
   and `swr` (pin, `base: getPrefetchedElements(route)`), **same
   `AbortSignal`** as `load`. Then `load({ signal, adopt })` with that
   promise. Follow attempts fetch normally (`follows > 0` fails the gate).
4. Skip `buildMergePatch` on adopted `loaded` (SWR already committed).
5. **Push the requested URL immediately.** On follow: **replace** that
   entry. On fail after paint: `restoreMeta`; replace the failure URL onto
   the same entry.
6. Scroll once on the paint, not again when the response lands.

A later Navigation-API instant, if any, writes its own analogue
(intercept already holds the URL; follow is a replace navigation). Harvest
only if that second implementation grows.

### Link pending status (follow-up)

Unifies on registry + `useOptimistic` (as in waku-navigation), because
per-Link `useTransition` cannot correlate browser-initiated navigations.
User-observable; own PR; e2e **plus** targeted unit tests. Rebuild does
not wait on this.

- Before: `pending` is true only for the clicked `Link`, driven by its
  own `useTransition`; programmatic and back/forward never mark a `Link`
  pending.
- After: clicked `Link` matched by element identity (same-`to` links stay
  independent); source-less navigations may mark matching hrefs pending;
  optimistic status reverts on commit/abort/error.
  `unstable_startTransition` bypass preserved.

## Migration plan

Each numbered step is its own PR, **green on the existing suite**, public
`waku/router/client` unchanged until entries. Steps 1–6 are
behavior-identical code motion (or equivalent). Do not freeze a driver
interface. Do not put user-observable work on the critical path of the
rebuild.

1. **Caches module** — prefetch manager (`mode` / `ttl`), static-path set,
   rscParams map; `clearCaches()`, `getPrefetchedElements`,
   `hasCachedShell`; test factory. Pure code motion.
2. **Loader** — `load()` + `LoadOutcome` + `adopt` (unused until step 6);
   `changeRoute` is the first consumer. Behavior-identical. Direct unit
   tests, no rendering.
3. **Merge-patch builder** — extract commit reconciliation.
4. **Contract slim** — `RouterContext` → `{ route, navigate }`; `Slice` via
   `registerLazySlice`; typed hooks rebind. Instant stays on history
   wrappers.
5. **Toolkit hooks** — `useRouteState`, scroll helpers, `useHmrRefetch`.
   No `Link` pending rewrite.
6. **History binding rebuild** — recompose `InnerRouter` / `Router`;
   instant confined with the `adopt` dual-write rules above; old
   `changeRoute` deleted. Existing router-client tests (including instant)
   stay the gate. Still the old `Link` pending mechanism.
7. **waku-navigation spike** against in-tree layer 1 — second consumer
   before the public surface freezes.
8. **Entries** — named layer-1 module; deprecate the `unstable_` grab-bag.

Follow-up PRs (decoupled; a stall here must not block 1–8):

- **Eager server-redirect in the loader** — after step 2 is identical; own
  tests for server-action interleaving. May conclude commit-time
  resolution stays.
- **`Link` pending status** — as specified above.
- **waku-navigation rewrite** on the published entry (separate repo).

Package split only if both bindings exist.

## Non-goals

- No changes to `waku/minimal` (soft; revisit only if a step forces it).
- No preservation of waku-navigation's current implementation details.
- No user-facing router API changes or new navigation features.
- No redesign of `unstable_instant` beyond relocating it and spelling out
  URL-commit and `adopt` dual-write.
- No `NavigationEngine` / `NavigationIntent` in the first implementation.

## Open questions

1. `LoadOutcome` details: is `failed.restoreMeta` the right shape, and
   should build-id mismatch be an outcome instead of a callback?
2. After behavior-identical `load()`, is eager server-redirect worth a
   follow-up, or does commit-time resolution stay?
3. `adopt` abort/invalidation during adoption: validated in step 6. Dual
   write, error shape, and same-signal cancel are specified above, not
   open. Fallback if it bends: overlay/swr passthrough, still no `instant`
   flag on `load`.
4. Entry naming for layer 1, and the deprecation window for the grab-bag.
5. Should the history binding sit in `bindings/` from day one, so a
   Navigation API binding is a peer?
