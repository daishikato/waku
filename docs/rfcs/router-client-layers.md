# RFC: Two-layer router client

Status: draft. Internal re-architecture of `waku/router`'s client. No
user-facing API change by itself. Subsequent refactoring PRs move toward
this layering.

This revision adopts the toolkit model (bindings own control flow; no
driver interface up front) and keeps the leak fence, prefetch `mode`/`ttl`
surface, and instant URL-commit policy as acceptance criteria.

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
   `navigate()` owned by L1). History and Navigation API disagree about who
   commits the URL and when; freezing an injected engine with zero
   implementations is the wrong first step. An interface may be harvested
   later from two working bindings if their shapes converge.
2. **Capabilities, not storage.** The host contract and cache module expose
   what a caller can do, never internal collections. (The `lazySliceIds`
   crash is what storage-shaped contracts produce.)
3. **Caches live in layer 1** as module state, matching existing precedent
   (`savedRscParams`, minimal's SWR WeakMaps). Bindings never see cache
   objects. They may call capabilities such as `hasCachedShell`.
   Consequences: prefetch is a plain function needing no host; HMR clearing
   is one exported call; multiple router roots share caches (correct: same
   app, same server). Cost: tests need an internal factory/reset for
   isolation, and the module must remain strictly client-side.
4. **`unstable_instant` is confined to the history binding.** The protocol,
   loader, contract, and typed shared surface never mention it. Its
   mechanism (overlay merge, SWR pinning) already lives in
   `waku/minimal/client` as generic element-store capabilities; the
   _feature_ — decision, overlay construction, transition bypass, **early
   URL commit then replace on follow** — is history-binding code. This also
   removes the `pendingTransition` late-decision dance from the shared path.
5. **`waku/minimal` is unchanged.** Overlay/SWR options on refetch are
   already isolated and abstract; nothing below the router moves.

### Leak fence (acceptance criteria)

A step is not done if it moves a right-hand item into Layer 1.

| Layer 1 | Not Layer 1 |
| --- | --- |
| Protocol, `load()` / `LoadOutcome`, follow loop | `unstable_instant` |
| Prefetch + session shell + static-path set | Skip-transition / paint-before-response |
| `hasCachedShell` (boolean capability) | Returning cache objects / `getShell` |
| Overlay/swr only as minimal merge tools the binding may call | Instant overlay construction, early URL paint |
| Follow + abort (`signal` accepted, not owned) | History vs Navigation control flow |
| define-router slots / meta / slices | create-pages page/layout builders |
| params / search hooks | Typegen, route `getConfig` codecs |
| `prefetchRoute({ mode, ttl })` | Driver / `NavigationEngine` / `Intent` |

If a flag named `instant` appears on `load()` or the host `navigate`, that
is the leak.

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
keep resolving at commit time via `RouterState` / `resolveServerRedirect`,
as today. Eager resolution inside the loader (settling `loaded.route` from
the response `ROUTE_ID`) is a later, separately tested step — it can
interleave with server actions and must not ride along with the extract.

```ts
buildMergePatch(
  outcome: Loaded, current: Elements, base: Elements,
): Elements
```

extracts the commit reconciliation (the guard against concurrent
server-action merges). The binding decides _when_ to apply it; the loader
never touches the store. Instant does not use this helper for its first
paint — it calls minimal overlay/swr itself.

`load()` does not take `overlay` / `swr`. Those stay on minimal. The
history binding’s instant path is a caller of minimal, not a loader flag.

### Caches (module state, internal)

```ts
prefetchRoute(route, opts?: { mode?: 'always' | 'once'; ttl?: number }): void
hasCachedShell(route, currentElements: Elements): boolean
clearCaches(): void
// internal: createCaches() for test isolation
```

- Prefetch manager: query-keyed TTL, size bound, build-id invalidation.
  `mode: 'always'` (default) dedupes by TTL for that path+query.
  `mode: 'once'` warms immutable slots for the `rscPath` (session shell),
  ignoring query — the same surface instant uses, not an instant API.
- Static-path set: after `IS_STATIC`, later visits skip refetch.
- `hasCachedShell` is the read path instant needs: true when the route slot
  is immutable in `currentElements` or in the session shell cache. Same
  gate as today’s `canCommitInstantly`. It does not return cache objects.
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

That is the whole public contract. Prefetching, slice bookkeeping, and
codec resolution are layer-1 module concerns, not host obligations. No
`instant`, no overlay hooks, no commit strategies.

The history binding keeps **binding-private** commit metadata (today’s
`RouterState` symbol) in the elements store. That is not a shared engine
slot for “whatever instant needs.” Instant’s URL policy is written out in
the history binding section below. A Navigation API binding does not need
`RouterState`.

### Components and hooks (contract-bound)

- `Slice` (registers lazy ids via layer-1 `registerLazySlice`),
  `Unstable_SearchCodecsProvider`, `ErrorBoundary`.
- Typed hooks: `useRouter` (core: `push` / `replace` / `reload` / `back` /
  `forward` / `prefetch` with `{ scroll }`), `useParams`, `useSearch`,
  `useSetSearch`. Written against the contract only. Waku’s layer 2
  re-exports a widened `useRouter` whose `NavigateOptions` adds
  `unstable_instant` via history-binding code; bindings that lack the
  feature ship the core hook unchanged.
- Shared policy helpers: `shouldScrollByDefault`,
  `shouldScrollForRouteChange`, `scrollToHash`, `useRouteState`,
  `useHmrRefetch`.

Typegen (`pages.gen.ts`) and declaring `unstable_searchCodec` on a route
stay server/app.

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

Plain `<a>` without `Link` is a Navigation binding property, not a Layer 1
feature.

### Instant URL commit (history binding — must be explicit)

This is the part a private slot would hide. It is history-binding code.
The loader does not know whether a URL was already committed.

**Wait-then-commit (default):** `load()` → apply merge patch inside a
transition → layout effect writes history (`push` / `replace`) as today.

**Instant:**

1. Gate with `hasCachedShell(route, currentElements)`. If false, take the
   wait-then-commit path (including `startTransition`).
2. Do not wrap the paint in an outer `startTransition`.
3. First paint via minimal: overlay `ROUTE` + binding commit metadata;
   `swr` pin of immutable/meta keys; adopt in-flight prefetch if any.
4. **Push the requested URL immediately** (before the response).
5. Continue `load()` for fetch/follow.
6. On a **follow** outcome: **replace** the URL already written. Do not
   push a second entry. (`follows > 0` after an early push is replace.)
7. On **fail** after paint: `restoreMeta` as today; replace the failure
   URL onto the same entry.
8. Scroll once on the instant paint, not again when the response lands.

A later Navigation-API instant, if any, would need its own analogue
(intercept already holds the URL; follow is a replace navigation). Do not
design that interface now; implement history instant against the steps
above, then harvest if a second binding grows the feature.

## Migration plan

Each step is its own PR (or stacked PR) and lands **green on the existing
test suite**. The public `waku/router/client` surface is unchanged until
the entries step. Do not freeze a driver interface.

1. **Caches module** — move prefetch manager (keep `mode` / `ttl`),
   static-path set, rscParams map to layer-1 module state; `clearCaches()`;
   `hasCachedShell`; internal factory for tests. Pure code motion.
   Instant still reads the same facts, now through the capability.
2. **Loader** — extract `fetchRoute` + follow + abort into `load()` with
   `LoadOutcome`; `changeRoute` is the first consumer. **Behavior-identical**
   (commit-time redirect resolution stays). Loader unit tests, no rendering.
3. **Merge-patch builder** — extract commit reconciliation.
4. **Contract slim** — `RouterContext` → `{ route, navigate }`; `Slice` via
   `registerLazySlice`; typed hooks rebind to the contract. Instant stays
   on the history `useRouter` wrapper only.
5. **Toolkit hooks** — `useRouteState`, scroll helpers, `useHmrRefetch`.
   **No** `Link` pending-status rewrite in this step.
6. **History binding rebuild** — recompose `InnerRouter` / `Router` from
   the toolkit; instant confined; URL commit/replace-on-follow as specified
   above; old `changeRoute` plumbing deleted. Existing router-client tests
   (including instant) stay the gate.
7. **Entries** — publish the layer-1 surface as a named module; deprecate
   the `unstable_` grab-bag exports.

Follow-up PRs (not bundled into the steps above):

- **Eager server-redirect in the loader** — only after step 2 is identical;
  own tests for server-action interleaving.
- **`Link` pending status** — registry + `useOptimistic`, because per-Link
  `useTransition` cannot correlate browser-initiated navigations. User-observable;
  own PR with before/after behavior; e2e plus targeted unit tests. Not
  only e2e-gated.
- **waku-navigation rewrite** as a Navigation API binding over layer 1
  (separate repo; not a blocker). No `unstable_instant` unless a later
  binding adds it.

Package split (`waku/router/navigation` vs `waku-navigation`) only if the
in-tree history binding and a Navigation binding both exist.

## Non-goals

- No changes to `waku/minimal` (soft constraint; revisit only if a step
  forces it).
- No preservation of waku-navigation's current implementation details.
- No user-facing router API changes or new navigation features.
- No redesign of `unstable_instant` beyond relocating it and spelling out
  its URL-commit policy.
- No `NavigationEngine` / `NavigationIntent` in the first implementation.

## Open questions

1. `LoadOutcome` details: is `failed.restoreMeta` the right shape for the
   restore-base semantics, and should build-id mismatch be an outcome
   instead of a callback?
2. After behavior-identical `load()`, is eager server-redirect resolution
   worth a follow-up, or does commit-time resolution stay?
3. Entry naming for layer 1, and the deprecation window for the grab-bag.
4. Should waku's history binding sit in a `bindings/`-style location from
   day one, so the Navigation API binding is a peer rather than an
   afterthought?
