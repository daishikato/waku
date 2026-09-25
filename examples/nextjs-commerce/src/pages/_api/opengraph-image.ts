import { opengraphImage } from 'components/opengraph-image';

// app/opengraph-image.tsx and its per-route variants become one endpoint that
// takes the title as a query parameter.
export const GET = async (req: Request) => {
  const title = new URL(req.url).searchParams.get('title') ?? undefined;
  return opengraphImage(title);
};
