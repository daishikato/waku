import { notFound } from 'waku/router/server';

export default function IntentMissingAction() {
  return (
    <form
      action={async () => {
        'use server';
        notFound();
        return 'missing';
      }}
    >
      <h1>Intent Missing Action</h1>
      <button type="submit">Missing action</button>
    </form>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
