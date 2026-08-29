import { unstable_redirect as redirect } from 'waku/router/server';

export default function MixAPage() {
  // mix-b has no page, so load 404-follows; a defined mix-b would throw in
  // the slot and update lastFollow, which is not the revisit this pin names
  redirect('/mix-b?mix=1' as '/');
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
