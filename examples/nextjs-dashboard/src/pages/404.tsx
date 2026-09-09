import { FaceFrownIcon } from '@heroicons/react/24/outline';
import { Link } from 'waku';

// Next.js scopes not-found.tsx per route segment; the original had one under
// dashboard/invoices/[id]/edit/. Waku has a single not-found page for the whole
// app, so the copy is generic and the "go back" link points home.
export default function NotFound() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-2">
      <title>404 Not Found | Acme Dashboard</title>
      <FaceFrownIcon className="w-10 text-gray-400" />
      <h2 className="text-xl font-semibold">404 Not Found</h2>
      <p>Could not find the requested page.</p>
      <Link
        to="/dashboard/invoices"
        className="mt-4 rounded-md bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-400"
      >
        Go Back
      </Link>
    </main>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
