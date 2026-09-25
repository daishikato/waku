import { getCollections, getPages, getProducts } from 'lib/shopify';
import { baseUrl } from 'lib/utils';

// app/sitemap.ts returned a MetadataRoute.Sitemap object and Next.js serialized
// it. Waku has no metadata routes, so this is an ordinary API route that writes
// the XML — which is all the convention was hiding.
export const GET = async () => {
  const routes = [
    { url: baseUrl, lastModified: new Date().toISOString() },
    ...(await getCollections()).map((collection) => ({
      url: `${baseUrl}${collection.path}`,
      lastModified: collection.updatedAt,
    })),
    ...(await getProducts({})).map((product) => ({
      url: `${baseUrl}/product/${product.handle}`,
      lastModified: product.updatedAt,
    })),
    ...(await getPages()).map((page) => ({
      url: `${baseUrl}/${page.handle}`,
      lastModified: page.updatedAt,
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) =>
      `  <url><loc>${route.url}</loc><lastmod>${route.lastModified}</lastmod></url>`,
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml' },
  });
};
