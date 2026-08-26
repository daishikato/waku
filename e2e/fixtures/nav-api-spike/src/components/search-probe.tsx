'use client';

import { useSearch_UNSTABLE as useSearch } from 'waku/router/client';

export const SearchProbe = () => {
  const search = useSearch({ from: '/search' });
  return <p data-testid="search">{search ? search.q : 'none'}</p>;
};
