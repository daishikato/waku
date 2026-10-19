# Remaining tasks from the early-adopter feedback work

Handoff list for the work toward a stable Waku 1.0: migrating real Next.js examples into waku-examples, acting as an early adopter, and turning what breaks or confuses into fixes, docs and tests.

**State:** wakujs/waku `main` is at `9024c88e` (after wakujs/waku#2357). The latest release is `v1.0.0-rc.3`, which includes neither wakujs/waku#2353 (`getRequest`) nor wakujs/waku#2357 (static-layout server actions). All 34 waku-examples are on `waku@1.0.0-rc.3`, each with an e2e spec.

Already filed upstream, not repeated here:

- wakujs/waku#2358: stabilize `redirect` / `notFound` and replace `unstable_rerenderRoute` with `refresh()`. It also lists the missing tests for redirect and notFound without JavaScript.
- wakujs/waku#2359: a client navigation redirected into a static route loses the redirect's query.

## Tasks, in suggested order

### 1. New-user walkthrough

Follow the path a new user takes, on current `main`, and fix what trips them up.

- Create apps from both `create-waku` templates (`templates/01_basic`, `templates/02_basic-js`), then run dev, build and start.
- Follow the Quick Start, every guide in `docs/guides` (26 entries, including `integrations/`) and `docs/create-pages.mdx`.
- Typecheck the guides' code snippets in a scratch app. Several were edited recently (wakujs/waku#2353, wakujs/waku#2354).
- Report findings first, then send docs fixes as small branches.

### 2. Dev-loop and HMR check

Use the migrated waku-examples apps the way a developer would, editing while `waku dev` runs (localhost is enough).

- Edit server components, client components, layouts, CSS (CSS modules, StyleX, vanilla-extract), middleware and server actions.
- Note whether state survives, whether a full reload happens, and what the error overlay shows for broken code.
- Good apps to start with: `fs-router/nextjs-dashboard`, `fs-router/nextjs-commerce`, `create-pages/weave-render`.

### 3. Next migration for coverage gaps

Port another real Next.js example into waku-examples, chosen for features the current set doesn't exercise: routing features, an ORM, auth, forms or MDX. Give it an e2e spec in dev and prd like the others.
Already covered under `fs-router/`: `nextjs-blog-starter`, `nextjs-dashboard` (auth, forms, Postgres via PGlite), `nextjs-commerce`, `nextjs-photo-modal`.

### 4. No-JS forms on static pages (not filed yet)

In production, a form posted without JavaScript to a fully static page gets the prerendered HTML back, and the action never runs. The Node adapter's `serveStatic` (from `@hono/node-server`) serves files for any method. A static layout over a dynamic page is not affected.

Reproduce with a static page containing an inline `'use server'` form action:

```sh
waku build && waku start
curl -X POST -d x=1 http://localhost:3000/static-action   # 200 text/html, no 303
```

Next step: check the other adapters (`bun`, `deno`, `aws-lambda`, `cloudflare`, `netlify`, `vercel`), then decide whether to file an upstream issue or fix it, for example by serving static files only for GET and HEAD.

### 5. waku-examples follow-ups after the next Waku release

Once a release includes wakujs/waku#2353 and wakujs/waku#2357:

- Bump `waku` in all examples.
- Replace `unstable_getHeaders` / `unstable_getRequest` with `getRequest()` in:
  - `fs-router/nextjs-commerce/src/lib/shopify/index.ts`
  - `fs-router/nextjs-dashboard/src/lib/cookie-jar.ts`
  - `fs-router/nextjs-dashboard/src/lib/session.ts`
- Make `fs-router/nextjs-dashboard/src/pages/dashboard/_layout.tsx` `render: 'static'`. It stayed dynamic only because of the bug wakujs/waku#2357 fixed.
- Run the full waku-examples e2e in dev and prd.
