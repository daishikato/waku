import { notFound } from 'waku/router/server';

export default function IntentMissing() {
  notFound();
  return null;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
