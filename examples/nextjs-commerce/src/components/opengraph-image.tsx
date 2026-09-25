// next/og's ImageResponse renders JSX to a PNG. Waku ships no equivalent, and
// the endpoints that used it (app/opengraph-image.tsx and its per-route
// variants) are API routes here.
//
// This returns an SVG, which needs no dependency and no font file, and which
// every social crawler renders. For PNG, `satori` plus `@resvg/resvg-js` — the
// two libraries ImageResponse itself is built on — work in a Waku API route
// unchanged.

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) =>
    c === '<'
      ? '&lt;'
      : c === '>'
        ? '&gt;'
        : c === '&'
          ? '&amp;'
          : c === "'"
            ? '&apos;'
            : '&quot;',
  );

export function opengraphImage(title = process.env.SITE_NAME || 'Acme Store') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#000000"/>
  <rect x="520" y="175" width="160" height="160" rx="24" fill="none" stroke="#404040" stroke-width="2"/>
  <path d="M600 232l24 42h-48z" fill="#ffffff"/>
  <path d="M600 268l24 42h-48z" fill="#ffffff"/>
  <text x="600" y="430" fill="#ffffff" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="64" font-weight="700" text-anchor="middle">${escapeXml(title)}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': 'public, max-age=3600',
    },
  });
}
