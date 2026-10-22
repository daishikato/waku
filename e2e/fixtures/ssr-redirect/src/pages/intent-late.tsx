import { Suspense } from 'react';
import { redirect } from 'waku/router/server';

async function LateRedirect() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  redirect('/destination');
  return null;
}

export default function IntentLateRedirect() {
  return (
    <Suspense fallback={<h1>Intent redirect shell</h1>}>
      <LateRedirect />
    </Suspense>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
