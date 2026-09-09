import { revalidate } from 'lib/shopify';

// app/api/revalidate/route.ts. Same handler, standard Request/Response instead
// of NextRequest/NextResponse. The `_api` directory is stripped from the URL
// (`_api/foo.ts` serves `/foo`), so keeping the Next.js path `/api/revalidate`
// — the one a Shopify webhook is configured with — means nesting under `api/`.
export const POST = async (req: Request) => revalidate(req);
