# Migration examples

Four Next.js App Router apps ported to Waku, in increasing order of complexity.
They exist to exercise Waku against real applications rather than fixtures, and
to ground the [Migrating from Next.js](https://waku.gg/guides/migrating-from-nextjs) guide.

| Example | Ported from | Lines | What it covers |
| --- | --- | --- | --- |
| [`nextjs-blog-starter`](./nextjs-blog-starter) | [`vercel/next.js` `examples/blog-starter`](https://github.com/vercel/next.js/tree/canary/examples/blog-starter) | ~700 | static generation, `staticPaths`, metadata, markdown, CSS modules, Tailwind v3 |
| [`nextjs-photo-modal`](./nextjs-photo-modal) | [`vercel/nextgram`](https://github.com/vercel/nextgram) | ~200 | parallel and intercepting routes, and what replaces them |
| [`nextjs-dashboard`](./nextjs-dashboard) | [`vercel/next-learn`](https://github.com/vercel/next-learn) `dashboard/final-example` | ~2,700 | auth, a database, server actions, streaming, error and 404 handling, search |
| [`nextjs-commerce`](./nextjs-commerce) | [`vercel/commerce`](https://github.com/vercel/commerce) | ~3,900 | cookies, optimistic UI, caching removal, sitemap/robots/OG endpoints |

Each has a README describing exactly what changed and why. All four run with no
credentials and no external services: the dashboard runs Postgres in-process
through PGlite, and the storefront serves local fixture data through the same
module interface a Shopify client would.

```sh
pnpm install
cd examples/<name>
pnpm typegen     # generates src/pages.gen.ts for typed routes
pnpm dev
```

They are workspace packages so they build against the Waku in `packages/waku`,
which is the point — they are a way to find bugs in it. `FINDINGS.md` records
what they turned up.

`examples/` is excluded from the repository's Prettier and ESLint runs, so the
ported code can stay close to its upstream source and the migration diff stays
readable.
