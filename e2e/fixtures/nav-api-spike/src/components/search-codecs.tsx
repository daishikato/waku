'use client';

import type { ReactNode } from 'react';
import { Unstable_SearchCodecsProvider } from 'waku/router/client';
import * as searchCodecs from '../lib/search.js';

export const SearchCodecs = ({ children }: { children: ReactNode }) => (
  <Unstable_SearchCodecsProvider searchCodecs={searchCodecs}>
    {children}
  </Unstable_SearchCodecsProvider>
);
