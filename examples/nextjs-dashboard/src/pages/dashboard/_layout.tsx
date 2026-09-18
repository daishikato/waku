import type { ReactNode } from 'react';
import { unstable_redirect as redirect } from 'waku/router/server';
import { auth } from '@/lib/session';
import SideNav from '@/ui/dashboard/sidenav';

// This redirect is for people, not for data.
//
// The original guards /dashboard from proxy.ts. Waku's Hono middleware cannot
// take that over: a client-side navigation fetches /RSC/R/dashboard.txt rather
// than /dashboard, so a path-matching middleware silently lets it through. This
// layout runs on both navigation types and sends a signed-out visitor to the
// login page.
//
// It is not the authorization boundary either. Waku renders this layout and
// the page beneath it as independent slots of the same response, so a redirect
// here does not stop the page from rendering its data. That is why every
// function in src/lib/data.ts and every mutation in src/lib/actions.ts calls
// requireSession() itself.
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
