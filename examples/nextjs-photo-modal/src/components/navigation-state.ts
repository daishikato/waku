'use client';

// Next.js decides between the photo page and the modal by *how* you arrived:
// an intercepting route only fills the modal slot on a soft navigation, while a
// hard load renders the page itself. Waku exposes no such distinction, so the
// app tracks it: this flag is false while the initial document hydrates and true
// for every render after that.
let hydrated = false;

export const markHydrated = () => {
  hydrated = true;
};

export const hasHydrated = () => hydrated;
