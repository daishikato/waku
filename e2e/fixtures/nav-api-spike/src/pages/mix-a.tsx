import { unstable_createCustomError as createCustomError } from 'waku/minimal/server';

export default function MixAPage() {
  // mix-b has no page; middleware answers its RSC request as HTTP 404 so
  // load 404-follows. a 200 404-page would skip that hop.
  throw createCustomError('Redirect', {
    status: 307,
    location: '/mix-b?mix=1',
  });
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
