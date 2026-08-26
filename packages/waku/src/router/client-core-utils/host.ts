// reload cannot be expressed here (no refetch bit; a same-route navigate
// would no-op), so it stays on the history binding.

import { createContext, useContext } from 'react';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

export type RouterHost = {
  route: RouteProps;
  navigate: (
    href: string,
    opts: {
      history: 'push' | 'replace';
      scroll?: boolean;
    },
  ) => Promise<void>;
};

export const RouterHostContext = createContext<RouterHost | null>(null);

export const useRouterHost = (): RouterHost => {
  const host = useContext(RouterHostContext);
  if (!host) {
    throw new Error('Missing RouterHost');
  }
  return host;
};
