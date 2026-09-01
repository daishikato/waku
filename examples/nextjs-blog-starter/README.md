# Next.js `blog-starter` → Waku

A migration of [`vercel/next.js/examples/blog-starter`](https://github.com/vercel/next.js/tree/canary/examples/blog-starter)
to Waku. Markdown files in `_posts/` are read at build time and every page is
prerendered, which is what the original does too.

```sh
pnpm install
pnpm typegen   # generates src/pages.gen.ts for typed routes
pnpm dev
pnpm build && pnpm start
```

## What changed

| Next.js | Waku |
| --- | --- |
| `app/layout.tsx` renders `<html>`/`<body>` | `src/pages/_root.tsx` renders the document shell, `src/pages/_layout.tsx` renders inside it |
| `export const metadata` | `<title>`/`<meta>`/`<link>` rendered in the component; Waku hoists them |
| `generateMetadata()` | same — render the tags with the page, using data you already fetched |
| `generateStaticParams()` | `staticPaths` in the page's `getConfig()` |
| (implicitly static) | `render: 'static'` in `getConfig()`, stated per page and layout |
| `params: Promise<{ slug }>` | `slug` arrives as a plain prop, typed by `PageProps<'/posts/[slug]'>` |
| `notFound()` from `next/navigation` | `unstable_notFound()` from `waku/router/server` |
| `next/link` `<Link href>` | `<Link to>` from `waku` |
| `next/image` | plain `<img>` — Waku has no image component |
| `next/font/google` | `@fontsource/inter`, imported from `globals.css` |
| `app/_components/` | `src/components/` |
| tsconfig `paths` resolve automatically | the same alias is declared in `waku.config.ts` for Vite |
| `postcss.config.js` with `module.exports` | ESM `export default` — Waku packages are `"type": "module"` |

Tailwind v3, PostCSS, CSS modules and `dangerouslySetInnerHTML` all work unchanged.

## Gotcha: layout and page metadata do not merge

The Next.js original puts a default `title` in `app/layout.tsx` and overrides it in
`app/posts/[slug]/page.tsx`. Waku has no metadata merging: both `<title>` elements are
hoisted into `<head>`, the layout's comes first, and browsers use the first one — so
the post title silently never applies.

This migration therefore keeps page-specific tags on the pages, and leaves only
genuinely global tags (icons, `theme-color`) in the layout.
