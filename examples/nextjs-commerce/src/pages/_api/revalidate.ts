import { revalidate } from 'lib/shopify';

// app/api/revalidate/route.ts. Same handler, standard Request/Response instead
// of NextRequest/NextResponse.
export const POST = async (req: Request) => revalidate(req);
