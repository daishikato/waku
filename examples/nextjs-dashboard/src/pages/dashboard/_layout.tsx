import type { ReactNode } from 'react';
import { unstable_redirect as redirect } from 'waku/router/server';
import { auth } from '@/lib/session';
import SideNav from '@/ui/dashboard/sidenav';

// This is where Next.js middleware went.
//
// The original guards /dashboard from proxy.ts. Waku's Hono middleware is not
// the right home for that check: a client-side navigation fetches
// /RSC/R/dashboard.txt rather than /dashboard, so a path-matching middleware
// silently lets it through. A layout runs for every route beneath it on both
// navigation types, so the check lives here instead.
export default async function Layout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen flex-col md:flex-row md:overflow-hidden">
      <div className="w-full flex-none md:w-64">
        <SideNav />
      </div>
      <div className="grow p-6 md:overflow-y-auto md:p-12">{children}</div>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
