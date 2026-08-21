# Router client layers

Proposal only. Not implemented. Not a published guide.

`waku/router/client` mixes engine (History), load/cache/follow, define-router protocol, and product policy (`unstable_instant`). Split so a Navigation-API client can share the core without inheriting instant, and so instant cannot leak downward.

Server side is already layered (`fsRouter` → `createPages` → `defineRouter` → minimal). This memo is the **client**.

## Goal

Extract an engine-agnostic Layer 1. Rewrite [waku-navigation](https://github.com/wakujs/waku-navigation) on L1 plus a Navigation engine — do not preserve today’s parallel `client.tsx`. Keep `unstable_instant` in Layer 2.

## Non-goals

- Matching Layer 2 to create-pages. create-pages is a server API. The shared client contract is **define-router** (`root` / `route:` slots, `ROUTE` / `HAS404` / `IS_STATIC`, slices).
- Changing minimal, unless overlay/swr cannot express a merge L1 needs. Prefer no change. SWR is already abstract; instant is one caller.
- Shipping `waku-navigation` from this repo in the first spike.
- Re-extracting pure helpers (`navigate.ts`). That already failed when elements became the source of truth.

## Picture

```
L2 (optional)     instant policy, ErrorBoundary, routeInterceptor, …
                  History Waku apps. waku-navigation may use none.

L1                engine-agnostic RSC navigation
                  load / merge / prefetch / follow / cache
                  Router, useRouter, Link, params/search
                  define-router slot protocol
                  overlay/swr as merge tools, not as instant

                  History engine          Navigation engine
                              \               /
                               waku/minimal
```

## Layer 1

Owns a navigation, not which browser API writes the URL. Never calls `history.pushState` or `navigation.navigate`.

### Engine (injected)

```ts
type NavigationEngine = {
  currentUrl(): URL;
  listen(onIntent: (intent: NavigationIntent) => void): () => void;
  commitUrl(url: URL, mode: 'push' | 'replace' | 'traverse'): void;
  back(): void;
  forward(): void;
  reload(): void;
};

type NavigationIntent = {
  url: URL;
  history: 'push' | 'replace' | 'traverse';
  signal?: AbortSignal;
  info?: unknown; // scroll: false, skip fake react-transition, …
  intercept?: (handler: () => Promise<void>) => void; // Navigation API
};
```

URL commit timing is the engine’s. History typically commits after merge. Navigation intercepts; the browser commits when the handler settles (native spinner). Plain `<a>` without `Link` is an engine property.

### Navigate / load

- `navigate(target)` — wait, merge, follow, settle. No `instant` flag.
- `load(rscPath, params, { signal, prefetched, overlay?, swr? })` — overlay/swr pass through to minimal.
- `prefetch(target, { mode?: 'always' | 'once', ttl? })`
- `decideFollow(error)` → follow | leave | stop

If a flag named `instant` appears on `navigate()`, that is the leak. L2 instant calls `load` with `{ overlay, swr }`.

### Cache (L1)

| Cache | Where | Role |
| --- | --- | --- |
| ETags | minimal (already) | Skip re-rendering unchanged slots |
| Prefetch + session shell | L1 | Query-keyed TTL; `rscPath`-keyed immutable slots (`mode: 'once'`) |
| Static path set | L1 | After `IS_STATIC`, later visits skip refetch |

`getShell(rscPath)` is readable by L2. Instant does not own a second store. HMR / build-id invalidation stay with this cache. `mode: 'once'` means warm immutable slots, which instant happens to use.

### Protocol

Location ↔ `rscPath`. `ROUTE` / `HAS404` / `IS_STATIC`. `<Slot id="root">` + `<Slot id={route:…}>`. Slices.

### UI / hooks

`<Router engine>`. `useRouter()`. Optional `<Link>` (type-safe `to`, prefetch, pending).

Also L1 (location + codecs, not engine/instant):

- `useParams(from)`
- `useSearch(from)` / `useSetSearch(from)` — `useSetSearch` is `navigate` on the same path
- `SearchCodecsProvider`
- `matchRouteParams` / `buildRouteHref`

Typegen (`pages.gen.ts`) and declaring `unstable_searchCodec` on a route stay server/app. Hooks are generic over whatever `RoutePath` the app augments.

## Layer 2

Product policy on top of L1. History Waku client. waku-navigation may skip it.

**`unstable_instant` lives only here:**

1. Gate: cached immutable shell (`canCommitInstantly` / `getShell`).
2. Skip outer `startTransition` so the paint is not deprioritized.
3. `load` with overlay (ROUTE / router state) + swr pin.
4. Ask the engine to commit the URL early; on follow, **replace** that entry.

That uses SWR; it is not SWR. L1 may pin meta / immutable slots with `swr` on any load.

Also reasonable as L2 (or app): `ErrorBoundary`, `unstable_routeInterceptor`.

## waku-navigation

L1 + Navigation engine. Not a fork of `router/client.tsx`. Current `src/client.tsx` is a draft of the engine plus a duplicated L1.

No `unstable_instant` unless a later Navigation L2 adds it.

## Minimal

Prefer no change. `unstable_overlay` / `unstable_swr` stay the merge API.

## Leak fence

| L1 | Not L1 |
| --- | --- |
| SWR / overlay merge | `unstable_instant` |
| Prefetch shell cache | Skip-transition / paint-before-response |
| Follow + abort | History vs Navigation (engines) |
| define-router slots / meta / slices | create-pages page/layout builders |
| params / search hooks | Typegen, route `getConfig` codecs |

## Implementation order (after this memo)

1. Review / freeze L1 signatures (`navigate`, `load`, engine, `getShell`).
2. In-tree spike: extract L1; History engine = current client minus instant; instant as L2 on the same `load()`. Keep `waku/router/client` as the public import.
3. Walk one wait-then-commit nav (both engines) and one instant nav (History L2 only) over the same `load()`.
4. Rewrite waku-navigation against L1 + Navigation engine in that repo.
5. Package split (`waku/router/navigation` vs `waku-navigation`) only if the in-tree spike holds.

## Open questions

- Is `intercept` on the intent enough for URL commit, or does a navigation session need an explicit commit callback?
- Does L1 `load` forward overlay/swr, or does L2 instant call `useMergeElements` itself? Forwarding is simpler if it does not grow an `instant` flag.
- Are typed params/search always on L1, or a tiny isomorphic module both L1 and typegen import? (Leaning L1 re-export.)
- Keep `unstable_events` out (already removed from Waku).
