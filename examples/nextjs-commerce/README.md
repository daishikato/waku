# Next.js Commerce → Waku

A migration of [`vercel/commerce`](https://github.com/vercel/commerce) — the
Shopify storefront — to Waku. It is the largest example of the set, and the one
that lands on Waku's stated strong fit: a mostly static catalogue with a cart,
search and personalisation that must always be fresh.

```sh
pnpm install
pnpm typegen
pnpm dev            # http://localhost:3000
```

No Shopify store is needed. `src/lib/shopify/` keeps the same exported functions
the components already import, backed by `fixture-data.ts` instead of the
Storefront API. In a real migration that directory moves across untouched apart
from the four Next.js APIs listed below.

## What changed

| Next.js | Waku |
| --- | --- |
| `app/layout.tsx` | `src/pages/_root.tsx` (document + fonts) + `src/pages/_layout.tsx` (cart provider, navbar) |
| `app/[page]/page.tsx` + `layout.tsx` | `src/pages/[page]/index.tsx` + `_layout.tsx` |
| `app/search/[collection]/page.tsx` | `src/pages/search/[collection].tsx` |
| `metadata` / `generateMetadata()` | tags rendered with the page |
| `app/sitemap.ts`, `app/robots.ts` | `src/pages/_api/sitemap.xml.ts`, `_api/robots.txt.ts` |
| `app/opengraph-image.tsx` (`next/og`) | `src/pages/_api/opengraph-image.ts`, returning SVG |
| `app/api/revalidate/route.ts` | `src/pages/_api/revalidate.ts`, plain `Request`/`Response` |
| `app/error.tsx` | `<StorefrontErrorBoundary>` in the root layout |
| `app/search/loading.tsx` | the `<Suspense>` already in the search layout |
| `"use cache"`, `cacheTag`, `cacheLife`, `revalidateTag` | deleted — Waku has no cache |
| `cookies()` | `src/lib/cookie-jar.ts` + `src/middleware/cookies.ts` |
| `next/link`, `next/navigation` | `src/lib/navigation.tsx` (see below) |
| `next/image` | plain `<img>` |
| `next/form` | a plain `<form action="/search">` |
| `geist/font/sans` | `@fontsource-variable/geist` |
| `next.config.ts` | `waku.config.ts` |

## A compatibility layer instead of a rename

`src/lib/navigation.tsx` is six exports — `Link` (taking `href`), `usePathname`,
`useSearchParams`, `useRouterCompat` — implemented over Waku's `Link` and
`useRouter`. Sixteen component files then change only their import line, and the
diff stays readable.

That is a deliberate contrast with the `nextjs-dashboard` example, which uses
Waku's API directly (`<Link to>`, `useRouter().path`). Both are fine; the shim
scales better on a large app, and it is also the natural place to put the one
cast typed routes need for hrefs built at runtime.

## The two things that actually broke

**Optimistic cart updates reverted silently.** The cart is the standard pattern:
`useOptimistic` seeded from a promise the layout creates, a form action that
applies the optimistic update and calls a server action, and `updateTag(TAGS.cart)`
at the end. That invalidation is what made Next.js re-run the layout with a fresh
cart. With no cache to invalidate, nothing re-renders, and `useOptimistic` state
only survives while the action is pending — so adding an item appeared to do
nothing, even though the server recorded it. Each mutation now ends with
`router.reload()`; see the note in `src/components/cart/add-to-cart.tsx`.

**Creating the cart and reading it back.** `createCartAndSetCookie()` writes a
cookie and the very next render has to see it. Waku's read path is the raw request
headers, so a cookie written during the request is invisible to it. The jar in
`src/lib/cookie-jar.ts` is therefore readable as well as writable.

## Smaller notes

- The homepage and every product page are `render: 'dynamic'`, because the root
  layout reads the cart cookie. Prerendering the catalogue would mean moving the
  cart into a [slice](https://waku.gg/#slices) so the rest of the page can stay
  static — the Waku equivalent of the partial prerendering the original enables.
- `next/og`'s `ImageResponse` has no counterpart. The OG endpoint returns SVG,
  which needs no dependency; `satori` + `@resvg/resvg-js` (what `ImageResponse`
  is built on) work in a Waku API route if you need PNG.
- `next/form` did a client-side navigation on submit; a plain form does a full
  page load.
- `tsconfig.json`'s `baseUrl` is deprecated in TypeScript 6, so the `lib/…` and
  `components/…` imports resolve through `paths`, mirrored as Vite aliases in
  `waku.config.ts`.
