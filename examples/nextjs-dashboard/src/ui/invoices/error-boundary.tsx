'use client';

import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useRouter } from 'waku';

// app/dashboard/invoices/error.tsx becomes an ordinary error boundary. Next.js
// discovers error.tsx by file convention and wraps the segment for you; in Waku
// you place the boundary yourself, which also means you choose how much of the
// tree it covers.
const Fallback = ({ resetErrorBoundary }: { resetErrorBoundary: () => void }) => {
  const router = useRouter();

  return (
    <main className="flex h-full flex-col items-center justify-center">
      <h2 className="text-center">Something went wrong!</h2>
      <button
        className="mt-4 rounded-md bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-400"
        onClick={() => {
          // reset() in Next.js re-renders the segment; here the router refetches
          // the route and the boundary is cleared.
          router.reload();
          resetErrorBoundary();
        }}
      >
        Try again
      </button>
    </main>
  );
};

export const InvoicesErrorBoundary = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary
    FallbackComponent={Fallback}
    onError={(error) => {
      console.error(error);
    }}
  >
    {children}
  </ErrorBoundary>
);
