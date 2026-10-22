import { redirect } from 'waku/router/server';

export default function IntentStaticRedirect() {
  redirect('/destination');
  return null;
}

export const getConfig = () => ({ render: 'static' }) as const;
