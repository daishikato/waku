import type { ReactNode } from 'react';
import '@fontsource-variable/geist';
import '../globals.css';

// geist/font/sans is a next/font loader, so it is replaced by the @fontsource
// package imported above and a font-family declared in globals.css.
export default function RootElement({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body className="bg-neutral-50 text-black selection:bg-teal-300 dark:bg-neutral-900 dark:text-white dark:selection:bg-pink-500 dark:selection:text-white">
        {children}
      </body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
