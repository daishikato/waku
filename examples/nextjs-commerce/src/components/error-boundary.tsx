'use client';

import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useRouter } from 'waku';

// app/error.tsx becomes an explicit boundary. Next.js finds error.tsx by file
// convention and wraps the segment; here you place it and choose its scope.
function Fallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
  const router = useRouter();

  return (
    <div className="mx-auto my-4 flex max-w-xl flex-col rounded-lg border border-neutral-200 bg-white p-8 md:p-12 dark:border-neutral-800 dark:bg-black">
      <h2 className="text-xl font-bold">Oh no!</h2>
      <p className="my-2">
        There was an issue with our storefront. This could be a temporary issue,
        please try your action again.
      </p>
      <button
        className="mx-auto mt-4 flex w-full items-center justify-center rounded-full bg-blue-600 p-4 tracking-wide text-white hover:opacity-90"
        onClick={() => {
          router.reload();
          resetErrorBoundary();
        }}
      >
        Try Again
      </button>
    </div>
  );
}

export function StorefrontErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary FallbackComponent={Fallback}>{children}</ErrorBoundary>;
}
