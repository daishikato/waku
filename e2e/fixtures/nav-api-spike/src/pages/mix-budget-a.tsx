import { unstable_redirect as redirect } from 'waku/router/server';

export default function MixBudgetAPage() {
  // mix-b has no page, so load 404-follows; the 404 slot then redirects to the
  // other mixcycle query so FollowBoundary remounts and the mixed chain can
  // reach the budget
  redirect('/mix-b?mixcycle=a' as '/');
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
