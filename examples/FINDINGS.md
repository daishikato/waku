# Waku v1 findings from migrating Next.js apps

Seven things the four migrations in this directory turned up, in the order they
were hit. Each was reproduced against `main`; where the repository's own fixtures
can show the problem, the repro uses those instead of the examples. Three were
already known, two need filing, and one turned out to be solvable in application
code.

| # | Finding | Status |
| --- | --- | --- |
| 1 | Layout metadata cannot be overridden by a page | already tracked: [#1903](https://github.com/wakujs/waku/issues/1903) |
| 2 | Every stylesheet emits an invalid `as="stylesheet"` preload | upstream React; same mechanism as [#1964](https://github.com/wakujs/waku/issues/1964) |
| 3 | Hono middleware cannot protect routes the way Next.js middleware does | **to file** — security-relevant, fails open |
| 4 | A cookie set by a server action is invisible to the render that follows | solvable in userland; docs/recipe gap |
| 5 | `unstable_notFound()` renders a blank page when the root layout imports CSS | already tracked: [#2280](https://github.com/wakujs/waku/issues/2280) |
| 6 | `unstable_rerenderRoute` is undocumented | folded into 7 |
| 7 | A server action that does not redirect re-renders nothing, breaking `useOptimistic` | **to file** |

## 1. Layout metadata is not overridable by a page (title/description/og:*)

**Where:** blog-starter migration (`examples/nextjs-blog-starter`)

**Next.js behaviour:** `metadata` exports merge down the tree. A `title` in
`app/layout.tsx` is the default and a `title` in `app/posts/[slug]/page.tsx`
replaces it.

**Waku behaviour:** both the layout's `<title>` and the page's `<title>` are
hoisted into `<head>`, layout first. Browsers and crawlers use the *first*
`<title>`, so the page's title never takes effect. Same for `<meta name="description">`
and `og:*` tags.

Built output of `/posts/hello-world`:

```html
<title>Next.js Blog Example with Markdown</title>          <!-- from _layout.tsx, wins -->
<title>Learn How to Pre-render Pages ... | Next.js Blog Example with Markdown</title>
```

**Impact:** high for migrations. "Defaults in the root layout, overridden per page"
is the single most common metadata pattern in Next.js apps, and it fails silently:
the build succeeds and every page ships the layout's title.

**Workaround:** never render `<title>`/`<meta name=description>`/`og:*` in a layout;
put them on every page instead.

**Suggested fix:** dedupe by tag identity when hoisting, keeping the innermost
(page-level) occurrence — or document the constraint prominently in the metadata
section of the README, which currently shows a `<meta>` in a layout and a `<title>`
in a page without mentioning that the two do not merge.

## 2. Every stylesheet emits an invalid `<link rel="preload" as="stylesheet">` (upstream React)

**Where:** every Waku app, including the stock `templates/01_basic`.

Built output of `templates/01_basic`:

```html
<link rel="preload" href="/assets/_layout-BiP-aVJ2.css" as="stylesheet"/>
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Nunito..." as="stylesheet"/>
```

`stylesheet` is not a valid `as` token (the valid one is `style`), so Chrome drops
the hint and logs `<link rel=preload> must have a valid 'as' value` — visible in the
console of any Waku app.

**Root cause is upstream, not Waku.** `react-server-dom-webpack-server` turns an
RSC-rendered `<link rel="stylesheet">` into a preload hint with `as` hardcoded to
`"stylesheet"`:

```js
// react-server-dom-webpack@19.2.8/cjs/react-server-dom-webpack-server.node.production.js:506
case "stylesheet":
  preload(srcSet, "stylesheet", { crossOrigin: props.crossOrigin, ... });
```

Verified that React DOM alone does not do this: rendering `<link rel="stylesheet"
precedence="default">` through `renderToReadableStream` emits only the stylesheet
link, no preload. It is the Flight server hint path that injects the bad `as`.

**Impact:** cosmetic plus a small perf loss — the intended CSS preload never happens
and every Waku app logs a console warning. Worth reporting to React; nothing to fix
in Waku, but worth knowing before v1 in case it gets reported as a Waku bug.

## 3. Hono middleware cannot protect routes the way Next.js middleware does

**Where:** next-learn dashboard migration (`examples/nextjs-dashboard`)

The Next.js original protects the dashboard in `proxy.ts` (middleware):

```ts
const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
if (isOnDashboard && !isLoggedIn) return false; // -> redirected to /login
```

The obvious port is Waku's Hono middleware with `c.req.path`. It does not work,
and it fails *open*: a full page load of `/dashboard` is redirected, but a
client-side navigation to the same route is not, because the router does not
request the page path. Observed on a stock example:

```
GET http://localhost:3104/               <- document
--- clicking a <Link> ---
GET http://localhost:3104/RSC/R/photos/1.txt?query=
```

So middleware matching `/dashboard` never sees the navigation, and the protected
route's RSC payload is served to an unauthenticated client. The check has to
either decode the `/RSC/R/<path>.txt` form as well, or live somewhere inside the
render.

**Impact:** high, and security-relevant. Middleware route protection is the
documented Next.js pattern; porting it verbatim produces an app that looks
protected and is not, with no error to notice.

**Workaround used in the example:** do the check in `dashboard/_layout.tsx`,
which runs for every dashboard route on both navigation types.

**Suggestions:** the middleware docs are a good place to say plainly that
`c.req.path` is not the route path for client navigations, and to point at
layout-level checks for authorization. A helper that maps a request to the
route path it will render (or exposing the decoded path on the Hono context)
would make the middleware port safe.

## 4. A cookie set by a server action is invisible to the render that follows it

**Where:** next-learn dashboard migration (`examples/nextjs-dashboard`) — the login flow.

This is the canonical login: a server action verifies the password, sets the
session cookie, and redirects to the protected page. In Next.js it works because
`cookies().set()` writes into the request-scoped cookie store, so any later read
*in the same request* sees the new value.

In Waku the only documented write path is "queue it and let middleware attach it
to the response" ([Request Context → Cookies](docs/guides/request-context.mdx)),
while the only read path is `unstable_getHeaders()['cookie']` — the raw incoming
request headers. So the write is invisible to the rest of the request:

```
POST /RSC/F/<id>/authenticate.txt     <- action sets the session cookie, redirects to /dashboard
GET  /RSC/R/login.txt?query=          <- client ends up back at /login
```

`redirect()` resolves server-side, so `/dashboard`'s layout renders inside that
same request, `auth()` reads request headers that do not carry the new cookie,
and the layout bounces the user to `/login`. The cookie *is* set — the browser
has it, and loading `/dashboard` afterwards works — but the login flow appears to
fail. The user has to log in and then navigate again.

**Impact:** high. Login-then-redirect is the most common cookie flow there is,
and the failure is silent: no error, the app just returns to the login page.
Cart cookies in a commerce app hit the same wall.

**Workaround used in the example:** the cookie jar in `src/lib/cookie-jar.ts`
also exposes a read (`readPendingCookie`), and `auth()` consults it before
falling back to request headers — reimplementing, per app, what a framework
cookie store does.

**Suggestion:** a small `unstable_cookies()` API that reads through pending
writes would remove both this and the middleware plumbing around it. If that is
out of scope for v1, the Request Context guide should at least show this pattern,
because the naive version looks correct and is not.

## 5. `unstable_notFound()` renders a blank page when the root layout imports CSS

**Severity: this one looks like a release blocker.** It reproduces in the repo's
own e2e fixture, and the condition that triggers it — a global stylesheet
imported by the root layout — is what `templates/01_basic` does out of the box.

**Repro** (on `main`, dev or production):

```sh
cd e2e/fixtures/broken-links
cat > src/pages/test.css <<'CSS'
body { margin: 0; }
CSS
cat > src/pages/_layout.tsx <<'TSX'
import type { ReactNode } from 'react';
import './test.css';

export default async function RootLayout({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export const getConfig = async () => ({ render: 'static' }) as const;
TSX
pnpm dev
```

| URL | expected | actual |
| --- | --- | --- |
| `/dynamic-not-found/sync` (page calls `unstable_notFound()`) | custom 404 page | **404 status, completely empty document** |
| `/no-such-route` (unmatched) | custom 404 page | custom 404 page ✓ |

Delete the `import './test.css'` line and `/dynamic-not-found/sync` renders the
404 page again. The stylesheet does not have to be used by anything; importing it
is enough.

Nothing renders at all — not server-side, and not after hydration either. The
page is blank, with the right status code.

**Why CI does not catch it:** `e2e/broken-links.spec.ts` asserts exactly this
behaviour (`await expect(page.getByRole('heading')).toHaveText('Custom not
found')`), but the fixture has no root layout, so the failing path is never
exercised. Adding a CSS-importing layout to that fixture turns the existing tests
red — which is probably the cheapest regression test to add.

**Also worth noting, separately from the bug:** even in the working case, a
`notFound()` result is not server-rendered. The initial HTML is empty and the 404
page appears only after hydration, while an unmatched route renders the 404 page
into the HTML. Clients without JavaScript see a blank page in the first case.

## 6. `unstable_rerenderRoute` is the answer to `revalidatePath`, and is undocumented

**Where:** next-learn dashboard migration — deleting an invoice.

A Next.js mutation action that stays on the page ends with `revalidatePath()`, and
the segment re-renders. In Waku, an action that ends in `redirect()` is fine, but
one that stays put changes nothing on screen: the row is gone from the database
and still visible until the next navigation.

`unstable_rerenderRoute(pathname, query)` does exactly what is needed, but it
appears nowhere in `README.md` or `docs/` — its only occurrence in the repo is
`e2e/fixtures/create-pages/src/components/RerenderActionPage.tsx`. Since
`revalidatePath` is in every Next.js mutation, this is the first thing a migrating
user will look for.

Two things worth documenting along with it: the second argument is the route's
query string (a re-render of `/dashboard/invoices` does not refresh a client
sitting on `/dashboard/invoices?page=2`), and an action has no way to discover the
route it was called from, so the caller has to pass it in.

## 7. `useOptimistic` + server action silently reverts without an explicit refresh

**Where:** Next.js Commerce migration (`examples/nextjs-commerce`) — the cart.

The Next.js cart is the standard optimistic pattern: a client provider holds
`useOptimistic` state seeded from a promise the root layout creates
(`<CartProvider cartPromise={getCart()}>`), the form action applies the optimistic
update and calls a server action, and the action ends with
`updateTag(TAGS.cart)`. That invalidation is what makes the layout re-run and
hand the provider a fresh cart.

Drop the invalidation (Waku has no cache to invalidate) and the flow breaks in a
way that is easy to misread: `useOptimistic` state only lives while the action is
pending, so the moment the action settles the UI snaps back to the stale promise
from the last render. Adding an item appeared to do nothing at all — no cart
panel, no badge, no line item — even though the server had recorded it correctly.

The fix is one line per mutation, `router.reload()` after awaiting the action (or
`unstable_rerenderRoute` on the server), but nothing points a migrating user
there: the code looks right, the action succeeds, and the UI just does not change.

**Suggestion:** worth an explicit paragraph wherever server actions are
documented — "an action that does not redirect does not re-render anything; ask
for it". This and finding 6 are the same missing sentence in the README's
Mutations section.


## Follow-ups from review

### Finding 4 does not need a Waku change

The request-scoped cookie jar in `nextjs-dashboard` and `nextjs-commerce` is
about fifty lines of ordinary application code and needs nothing from the
framework. It is the only userland route that works, though — the more obvious
Hono-native one silently does not:

```ts
// src/middleware/context-storage.ts
import { contextStorage } from 'hono/context-storage';
export default () => contextStorage();

// anywhere in server code
getContext().header('set-cookie', value, { append: true });
```

This type-checks, builds, throws nothing at runtime, and the header never
reaches the response: Waku's handler returns its own `Response`, which replaces
`c.res` and drops Hono's prepared headers. Verified by logging in — no
`Set-Cookie`, no error, and the app quietly stays logged out.

So the working recipe is specifically: middleware that wraps `next()` in an
`AsyncLocalStorage` scope and rebuilds `c.res` with the queued headers appended,
plus a read-through so a cookie written during the request is visible to the
render that follows it. That last part is the non-obvious half, and without it
login-then-redirect fails.

Worth a recipe in the Request Context guide, which currently shows only the
write half, and shows it as middleware reading a cookie it already had.

### Finding 3 in numbers

With middleware as the only guard and no session cookie:

```
GET /dashboard                    -> 302  Location: /login
GET /RSC/R/dashboard.txt?query=   -> 200  24911 bytes
```

The 24 KB payload is the rendered dashboard, including the figures it exists to
protect (`$1,006.26`, `$1,256.32`, per-invoice amounts, customer names). In a
browser, a visitor with no cookies clicking a `<Link to="/dashboard">` gets a
rendered dashboard.
