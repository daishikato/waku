import { redirect } from 'waku/router/server';

export default function IntentAction() {
  return (
    <form
      action={async () => {
        'use server';
        redirect('/destination');
        return 'saved';
      }}
    >
      <h1>Intent Action</h1>
      <button type="submit">Intent redirect action</button>
    </form>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
