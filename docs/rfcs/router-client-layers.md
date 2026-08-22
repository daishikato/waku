# RFC: Two-layer router client

Status: draft. This document proposes an internal re-architecture of
`waku/router`'s client implementation. It changes no user-facing API by
itself; it defines the layering that subsequent refactoring PRs move toward.

It supersedes the memo from PR #1 (`docs/proposals/router-client-layers.md`
on that branch) and folds in its leak-fence criteria and prefetch surface;
`docs/rfcs/` is the single location going forward.

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
  `lazySliceIds`, so `<Slice lazy>` crashes against current waku.

The server side already has clean layering (`createPages` is a wrapper over
`unstable_defineRouter`). The client has nothing equivalent.

## Proposal

Split the router client into two layers:

- **Layer 1 — router core.** Engine-agnostic: it does not know how URL
  changes are detected or committed. Protocol vocabulary, a React-free route
  loader, caches, the host contract, shared components, and the typed hooks.
  This is the layer `waku-navigation` (rewritten) builds on.
- **Layer 2 — engine bindings.** Waku ships a history/popstate binding
  (including `unstable_instant`). A rewritten `waku-navigation` is a
  Navigation API binding. Each binding owns its own control flow and event
  topology.

### Design principles

1. **Toolkit, not framework.** Layer 1 exposes composable functions and
   small hooks; each binding is the top-level owner of its control flow and
   calls into layer 1 à la carte. There is deliberately **no driver
   interface** (no shared `Intent` vocabulary, no inversion of control).
   An interface may be harvested later from two working bindings if their
   shapes converge; it is not designed up front.
2. **Capabilities, not storage.** The host contract exposes what a host can
   do, never its internal collections. (The `lazySliceIds` crash is what
   storage-shaped contracts produce.)
3. **Caches live in layer 1** as module state, matching existing precedent
   (`savedRscParams`, minimal's SWR WeakMaps). Bindings never hold or
   manage cache stores; where a binding needs cache-derived information,
   layer 1 exports a read capability (see `getPrefetchedElements` below) —
   principle 2 applied to caches. Consequences: prefetch becomes a plain
   function needing no host; HMR clearing is one exported call; multiple
   router roots share caches (correct: same app, same server). Cost: tests
   need an internal factory/reset for isolation, and the module must
   remain strictly client-side.
4. **`unstable_instant` is confined to the history binding.** The protocol,
   loader, contract, and typed shared surface never mention it. Its
   mechanism (overlay merge, SWR pinning) already lives in
   `waku/minimal/client` as generic element-store capabilities; the
   _feature_ — decision, overlay construction, transition bypass, history
   replay on follow — is history-binding code. This also removes the
   `pendingTransition` late-decision dance from the shared path: the
   contract's `navigate` is always transition-wrapped.
5. **`waku/minimal` is unchanged.** The overlay/SWR options on refetch are
   already isolated and abstract; nothing below the router moves.

## Layer 1 API

### Protocol (isomorphic, no React)

Today's `isomorphic-utils/`, published deliberately instead of leaked:

```ts
parseRoute(url: URL): Route // { path, query, hash }
encodeRoutePath(path): string
getRouteSlotId(path) / getSliceSlotId(id)
ROUTE_ID / IS_STATIC_ID / HAS404_ID // element meta accessors
buildRouteHref(target, resolveCodec?): string
matchRouteParams(from, path): Params | null
addBase / removeBase
getErrorInfo(err) // status/location introspection
```

The type-only imports from `create-pages-utils` in `build-route-href.ts`
and `match-route-params.ts` are split so runtime modules carry no upward
dependency (the types collapse to `string` without user augmentation, as
today).

### Route loader (client, React-free)

The extraction of `changeRoute`'s `fetchRoute` + follow loop + abort
handling into a plain async function:

```ts
load(requested: Route, opts: {
  signal: AbortSignal;
  refetch?: boolean;   // force even if static/same
  onBuildIdMismatch?: (url: URL) => void;
  onInvalidate?: (url: URL) => void;
}): Promise<LoadOutcome>

type LoadOutcome =
  | { type: 'loaded';   // fetched; ready to commit
      route: Route; url: URL;
      elements: Elements; follows: number }
  | { type: 'reused';   // commit without fetching
      route: Route; url: URL; follows: number }
  | { type: 'external'; // leave the app
      url: URL; error: unknown }
  | { type: 'failed';
      route: Route; url: URL; error: unknown;
      restoreMeta: boolean }
  | { type: 'aborted' };
```

Internally: prefetch-cache consultation, static-path fast path and
learning, and the redirect/404 follow loop (`decideFollow`, cap at
`MAX_FOLLOWS_PER_NAVIGATION`). The signal is _accepted_, not owned — the
history binding creates an `AbortController` per navigation; a Navigation
API binding passes `event.signal`.

The loader extraction itself is behavior-identical: it moves the fetch,
follow, and abort paths, and `loaded.route` initially carries the
requested route with commit-time server-redirect resolution
(`resolveServerRedirect` via `RouterState`) left where it is. Making
`loaded.route` the eagerly settled destination — resolved from the
response's `ROUTE_ID`, with the binding applying the URL correction
(history: `replaceState`; Navigation API: a flagged replace navigation) —
is a real behavior change and lands as its own migration step with its own
tests, not inside the extraction.

A prior attempt to extract pure navigation helpers (`navigate.ts`) failed
when the elements store became the source of truth. The loader boundary
differs in kind: it never writes the store — commit stays with the
bindings — so the store-authority problem that sank that extraction does
not apply to it.

```ts
buildMergePatch(
  outcome: Loaded, current: Elements, base: Elements,
): Elements
```

extracts the commit reconciliation (the guard against concurrent
server-action merges). The binding decides _when_ to apply it (inside
which transition); the loader never touches the store.

### Caches (module state, internal)

```ts
prefetchRoute(route, opts?: {
  mode?: 'always' | 'once'; // 'once': warm
  ttl?: number; //  immutable slots and keep them
}): void // plain function, needs no host

// read capability for bindings:
getPrefetchedElements(route):
  Elements | undefined

clearCaches(): void // HMR
// internal: createCaches() for tests
```

Covers the prefetch manager (TTL, build-id invalidation), static-path set,
rscParams identity map, and lazy-slice registrations. The server-action
elements listener that learns static paths moves here too.

`getPrefetchedElements` is the read path principle 3 requires: it returns
a snapshot of prefetched elements for a route (or nothing), never the
store. It is a general cache read — the instant gate is one caller (it
checks the snapshot for an immutable shell and reuses it as the SWR
base), not the API's shape. Instant does not own a second store.

### Host contract (React context)

```ts
type RouterHost = {
  route: Route;
  navigate: (
    href: string,
    opts: {
      history: 'push' | 'replace';
      scroll?: boolean;
    },
  ) => Promise<void>;
  // engine-private slot, opaque to layer 1
};
```

That is the whole contract. Prefetching, slice bookkeeping, and codec
resolution are layer-1 module concerns, not host obligations — the surface
that can drift is minimized. No `instant`, no overlay hooks, no commit
strategies: `waku-navigation` is the existence proof that a complete
router needs none of them, and waku's own binding accesses its extras
through the private slot.

### Components and hooks (contract-bound)

- `Slice` (registers lazy ids via layer-1 `registerLazySlice`),
  `Unstable_SearchCodecsProvider`, `ErrorBoundary`.
- Typed hooks: `useRouter` (core: `push`/`replace`/`reload`/`back`/
  `forward`/`prefetch` with `{ scroll }` options), `useParams`,
  `useSearch`, `useSetSearch`. Written against the contract only.
  Waku's layer 2 re-exports a widened `useRouter` whose `NavigateOptions`
  adds `unstable_instant` via its engine slot; bindings that lack the
  feature ship the core hook unchanged.
- Shared policy helpers: `shouldScrollByDefault`,
  `shouldScrollForRouteChange`, `scrollToHash`, `useRouteState` (route +
  render-error + settled-route reading), a link registry hook (element ↔
  href correlation and optimistic pending status), `useHmrRefetch`.

## Layer 2: binding responsibilities

| Concern            | History binding (waku)                                                       | Navigation API binding                                               |
| ------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Initiation         | `Link` onClick, popstate, programmatic                                       | one `navigate` listener (filters `canIntercept`, download, formData) |
| Abort              | own `AbortController`, supersede previous                                    | `event.signal`                                                       |
| URL commit         | deferred to post-React-commit (`RouterState` machinery, now binding-private) | browser commits at intercept                                         |
| Scroll             | manual (`scrollToHash` + policy)                                             | browser after handler resolves, or `scroll: 'manual'`                |
| Server redirect    | `replaceState`                                                               | flagged replace navigation                                           |
| Transitions        | wraps commit; re-wraps after await                                           | same, inside intercept handler                                       |
| `unstable_instant` | full feature lives here                                                      | absent                                                               |

`RouterState` (the symbol-keyed commit metadata in the elements store)
becomes the history binding's private mechanism — the Navigation API
binding does not need it, and eager redirect resolution in the loader may
shrink it further or remove it.

### The engine-private slot, concretely

For waku's history binding the slot holds its extended dispatch: a
`navigate` variant whose options add `unstable_instant` and the
`startTransition` override. The widened `useRouter` and `Link` read it;
layer 1 treats the slot as opaque and the core hooks never touch it. A
binding without extras provides no slot.

### `unstable_instant` inside the history binding

Instant is not just a load flavor; it needs the binding's own URL
machinery to cooperate, so it cannot be expressed against the contract:

1. **Gate**: `getPrefetchedElements(route)` plus the current store
   snapshot decide whether an immutable shell can paint
   (`canCommitInstantly`).
2. **Schedule**: skip the outer `startTransition` so the paint is not
   deprioritized (the late decision stays binding-internal).
3. **Load**: refetch with `unstable_overlay` (route meta + commit
   metadata) and `unstable_swr` (pin, prefetched base) — minimal's
   generic merge options, forwarded opaquely through `load()` so the
   follow loop is not duplicated in the binding. The fence test: the
   moment that passthrough grows an instant-specific field (any `instant`
   flag on `load`), it is the leak this document exists to prevent.
4. **URL**: commit the URL _early_, before the response settles; if the
   navigation then follows a redirect or 404, **replace** the entry it
   wrote. This early-commit-then-replace is explicit history-binding
   logic, not something a shared engine abstraction could hide.

### Link pending status

Unifies on the registry + `useOptimistic` mechanism (as in
waku-navigation today), because per-Link `useTransition` cannot correlate
browser-initiated navigations. This is user-observable, so it ships as
its own e2e-gated step with the delta spelled out:

- Before: `pending` is true only for the clicked `Link`, driven by its
  own `useTransition`; programmatic and back/forward navigations never
  mark any `Link` pending.
- After: the initiating `Link` is matched by element identity on clicks
  (same-`to` links stay independent) and by href for source-less
  navigations (programmatic, traverse), which _can now mark matching
  links pending_; optimistic status reverts automatically on
  commit/abort/error. The `unstable_startTransition` bypass behavior is
  preserved.

## Leak fences (acceptance criteria)

Checked at review time for every migration step:

| Belongs in layer 1                      | Must never appear in layer 1                |
| --------------------------------------- | ------------------------------------------- |
| loader, follow + abort, merge patch     | `instant` (any flag, option, or branch)     |
| prefetch cache + read capability        | skip-transition / paint-before-response     |
| define-router slots / meta / slices     | `history.pushState` / `navigation.navigate` |
| params / search hooks, codec resolution | popstate / `navigate`-event listeners       |
| contract: `route` + `navigate`          | `RouterState` commit metadata               |
| overlay/swr forwarded as merge options  | create-pages page/layout builders, typegen  |

And in the other direction: bindings never import cache stores, never
write elements outside `buildMergePatch` output plus their own
binding-private keys, and the Navigation API binding contains no
`unstable_instant`.

## Migration plan

Each step lands green on the existing test suite; the public
`waku/router/client` surface is unchanged until step 9. Steps 1–3 and 5
are behavior-identical code motion; 4, 6, and 7 change observable
behavior and say so.

1. **Caches module** — move prefetch manager, static-path set, rscParams
   map to layer-1 module state; `clearCaches()`, `getPrefetchedElements`;
   internal factory for tests. Pure code motion.
2. **Loader** — extract `fetchRoute` + follow + abort into `load()` with
   `LoadOutcome`; `changeRoute` becomes its first consumer. Commit-time
   redirect resolution stays put; behavior-identical. Loader gains direct
   unit tests (no rendering).
3. **Merge-patch builder** — extract commit reconciliation.
4. **Eager redirect resolution** — `loaded.route` becomes the settled
   destination; commit-time `resolveServerRedirect` retires. Behavior
   change, own tests (server-action interleaving is the case to cover).
5. **Contract slim** — `RouterContext` → `{ route, navigate }` + private
   slot; `Slice` via `registerLazySlice`; typed hooks rebind to the
   contract.
6. **Link pending status** — registry + `useOptimistic` replaces per-Link
   `useTransition`. User-observable (see delta above); own PR, e2e-gated.
7. **History binding rebuild** — recompose `InnerRouter`/`Router` from the
   toolkit (`useRouteState`, registry, scroll policy); instant confined;
   old `changeRoute` plumbing deleted.
8. **waku-navigation spike** against the in-tree layer 1 — validates the
   toolkit shape with a second consumer _before_ the public surface
   freezes.
9. **Entries** — publish the layer-1 surface as a named module; deprecate
   the `unstable_` grab-bag exports.
10. **waku-navigation rewrite** ships on the published entry (separate
    repo).

## Non-goals

- No changes to `waku/minimal` (soft constraint; revisit only if a step
  forces it).
- No preservation of waku-navigation's current implementation details.
- No user-facing router API changes or new navigation features.
- No redesign of `unstable_instant` beyond relocating it.

## Open questions

1. `LoadOutcome` details: is `failed.restoreMeta` the right shape for the
   restore-base semantics, and should build-id mismatch be an outcome
   instead of a callback?
2. Eager redirect resolution (step 4): any behavior commit-time
   resolution supports that eager resolution cannot reproduce
   (interleaving with server actions is the suspect case)?
3. The `load()` merge passthrough: is forwarding minimal's
   `overlay`/`swr` options opaquely the right seam, or should instant
   share the follow loop some other way? (Either way, no `instant` flag
   on `load` — see the fence.)
4. Entry naming for layer 1, and the deprecation window for the grab-bag.
5. Should waku's history binding sit in a `bindings/`-style location from
   day one, so the Navigation API binding is a peer rather than an
   afterthought?
