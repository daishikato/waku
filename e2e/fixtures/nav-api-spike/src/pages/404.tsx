import { unstable_redirect as redirect } from 'waku/router/server';

export default function NotFoundPage({ query = '' }: { query?: string }) {
  if (new URLSearchParams(query).has('mix')) {
    redirect('/mix-b?mix=1' as '/');
  }
  return <h1 data-testid="not-found">Custom 404</h1>;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
