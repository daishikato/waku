'use client';

import { useEffect } from 'react';
import { markHydrated } from './navigation-state';

// Mounted once by the root layout. Its effect runs after the first page has
// hydrated, which is how <Photo> tells a fresh page load apart from a
// client-side navigation.
export const HydrationMarker = () => {
  useEffect(() => {
    markHydrated();
  }, []);

  return null;
};
