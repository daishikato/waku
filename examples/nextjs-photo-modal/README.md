# NextGram (parallel + intercepting routes) → Waku

A migration of [`vercel/nextgram`](https://github.com/vercel/nextgram), the canonical
demo of Next.js **parallel routes** and **intercepting routes**: clicking a photo in
the feed opens it in a modal without leaving the page, while loading the same URL
directly renders a standalone page.

```sh
pnpm install
pnpm typegen
pnpm dev
```

## Waku has neither feature — and does not need them here

The Next.js version relies on three routing features at once:

```
app/
├── layout.tsx                       # renders {children} and {modal} side by side
├── default.tsx                      # the modal slot's fallback
├── photos/[id]/page.tsx             # the standalone photo page
└── @modal/                          # a named parallel route slot
    ├── default.tsx
    └── (.)photos/[id]/page.tsx      # intercepts /photos/[id] on soft navigation
```

Waku has no parallel routes, no intercepting routes, and no `default.tsx`. What it
has instead is **layout persistence**: navigating from `/` to `/photos/2` swaps the
page element and keeps the layout — and everything the layout renders — mounted.

So the feed moves up into the layout, and the photo route renders only the overlay:

```
src/pages/
├── _root.tsx          # <html>, <body>, and the #modal-root portal target
├── _layout.tsx        # renders <Feed /> and {children}  ← the parallel slot
├── index.tsx          # renders null                     ← app/default.tsx
└── photos/[id].tsx    # the photo, standalone or as a modal
```

Verified to behave like the original:

| | Next.js | this app |
| --- | --- | --- |
| Click a photo in the feed | modal over the feed | modal over the feed, feed DOM node preserved |
| Load `/photos/3` directly | standalone page | standalone page |
| Dismiss the modal | back to `/` | back to `/` |
| Reload while the modal is open | standalone page | standalone page |

## The one thing the app has to do itself

Next.js decides between the two renderings by *how you arrived*: an intercepting
route only fills the modal slot on a soft navigation. Waku exposes no soft/hard
distinction, so `src/components/navigation-state.ts` tracks it in four lines — a
flag flipped by an effect in the root layout, read during render by the photo
component.

Two smaller consequences:

- The modal decision is a client component's, so `photos/[id].tsx` delegates to one.
  In Next.js the choice happens server-side, in the router.
- On a hard load the feed is still rendered by the layout, so it is hidden with
  `body:has([data-standalone]) .cards-container { display: none }`. In Next.js the
  feed was simply not part of that render.
