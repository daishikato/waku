# Next.js Learn dashboard → Waku

A migration of [`vercel/next-learn`](https://github.com/vercel/next-learn)'s
`dashboard/final-example` — the app built by the official Next.js Learn course —
to Waku. It is the middle example of the set: authentication, a database, server
actions with validation, streaming, search and pagination.

```sh
pnpm install
pnpm typegen
pnpm dev            # http://localhost:3000
```

Log in with `user@nextmail.com` / `123456`.

`waku dev` runs with a fixed development session secret. `waku build` and
`waku start` set `NODE_ENV=production`, where the app refuses to sign sessions
without one:

```sh
SESSION_SECRET=$(openssl rand -hex 32) pnpm start
```

No credentials or services are needed: the Postgres database runs in-process via
[PGlite](https://pglite.dev) and seeds itself on first use. Set `PGLITE_DATA_DIR`
to keep it on disk between runs.

## What changed

| Next.js | Waku |
| --- | --- |
| `app/layout.tsx` renders `<html>`/`<body>` | `src/pages/_root.tsx` + `src/pages/_layout.tsx` |
| `app/dashboard/(overview)/page.tsx` | `src/pages/dashboard/index.tsx` (route groups exist in Waku, but this one only scoped `loading.tsx`) |
| `loading.tsx` | the `<Suspense>` fallbacks that were already there |
| `error.tsx` | an explicit `<ErrorBoundary>` (`react-error-boundary`) around the part of the tree it covered |
| `not-found.tsx`, per segment | one `src/pages/404.tsx` for the whole app |
| `notFound()` | `unstable_notFound()` from `waku/router/server` |
| `redirect()` | `unstable_redirect()` — typed against the app's routes |
| `revalidatePath()` | `router.reload()` from the client after the action — see below |
| `searchParams` prop (parsed) | `query` prop (the raw query string) |
| `useSearchParams()`, `usePathname()`, `useRouter()` | one `useRouter()` with `path`, `query`, `push`, `replace` |
| `middleware`/`proxy.ts` route protection | `requireSession()` in the data layer and actions, plus a redirect in `dashboard/_layout.tsx` — see below |
| `next-auth` v5 | `src/lib/session.ts`: ~60 lines over `jose` |
| `cookies().set()` | a cookie jar (`src/lib/cookie-jar.ts`) + `src/middleware/cookies.ts` |
| `postgres` (hosted) | PGlite behind the same tagged-template `sql` (`src/lib/db.ts`) |
| `next/font/google` | `@fontsource/inter`, `@fontsource/lusitana` |
| `next/image` | plain `<img>` |
| route handlers `app/*/route.ts` | `src/pages/_api/*.ts` |

`app/lib/data.ts` — every SQL query in the app — is unchanged apart from its
import line, and so are the forms, tables, skeletons and the Zod validation in
the server actions.

## The four things that needed real thought

**Route protection is neither middleware nor a layout.** The original guards
`/dashboard` in `proxy.ts`. Porting that check to Hono middleware *looks* right
and fails open: a client-side navigation requests `/RSC/R/dashboard.txt`, not
`/dashboard`, so a path-matching middleware never sees it and serves the
protected payload. Moving the check into `dashboard/_layout.tsx` is not enough
either — Waku renders the layout and the page as independent slots of one
response, and a redirect thrown in the layout does not stop the page from
rendering its data:

```
GET /dashboard                     -> 307  Location: /login
GET /RSC/R/dashboard.txt           -> 200  22,327 bytes, every figure included   (layout check only)
GET /RSC/R/dashboard.txt           -> 200  8,480 bytes, error slots, no data     (data-layer check)
```

So the boundary is `requireSession()` at the top of every function in
`src/lib/data.ts`, every mutation in `src/lib/actions.ts`, and both API routes.
The layout keeps its redirect, but only so that a signed-out visitor lands on the
login page instead of an error.

**Setting a cookie takes a round trip through middleware.** Waku has no
`cookies().set()`. Server code can read request headers; only middleware owns the
response. So `src/lib/cookie-jar.ts` opens an `AsyncLocalStorage` jar per request,
`signIn()`/`signOut()` drop `Set-Cookie` strings into it, and
`src/middleware/cookies.ts` attaches them on the way out.

That is not quite enough on its own. `redirect()` resolves server-side, so the
destination renders *in the same request* — where `unstable_getHeaders()` still
reports the cookies the browser sent, not the one just queued. Logging in would
set the session and then bounce you back to `/login`. The jar therefore also
supports reading pending cookies, and `auth()` checks it first.

**Nothing refreshes after a mutation.** `deleteInvoice` stays on the page, and
Waku re-renders nothing after an action that does not redirect: the row was gone
from the database and still on screen. The documented counterpart of
`revalidatePath()` is `unstable_rerenderRoute()`, and it worked here until the
data-layer checks changed the timing of the response — the client only applies
the re-rendered page when the page slot streams before the layout slot
([wakujs/waku#2288](https://github.com/wakujs/waku/issues/2288)). The delete button is therefore a client component
that awaits the action and calls `router.reload()`, which refetches the route
through the navigation path and is not order-sensitive.

**Typed routes reject computed hrefs.** `redirect(formData.get('redirectTo'))`
does not compile, and neither does `` `${pathname}?${params}` ``. The pagination
component types its builder as `` `/dashboard/invoices?${string}` ``; `Search`,
which is used on two routes, casts through `ComponentProps<typeof Link>['to']`
because `waku/router` does not export that type. For the login callback URL the
type error is a feature: it forces the target to be matched against a list of
known routes, which is how you avoid an open redirect anyway.

## Known bug this example reproduces

`unstable_notFound()` renders a **blank page** — correct 404 status, empty
document — because `src/pages/_layout.tsx` imports a global stylesheet. Visit
`/dashboard/invoices/00000000-0000-0000-0000-000000000000/edit` to see it. An
unmatched URL such as `/no-such-page` renders `src/pages/404.tsx` correctly.
Removing the CSS import from the root layout fixes the former and is not a real
option for an app. This is reproducible in Waku's own `e2e/fixtures/broken-links`.

## Upstream quirk carried over

`fetchCardData()` upstream reads `data[0].count`, which is postgres.js's row count
from the command tag (always 1 for `SELECT COUNT(*)`), not the counted column. The
shim in `db.ts` returns plain arrays, so this example reads `data[0][0].count`.
