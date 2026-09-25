import { baseUrl } from 'lib/utils';

export const GET = async () =>
  new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\nHost: ${baseUrl}\n`,
    { headers: { 'content-type': 'text/plain' } },
  );
