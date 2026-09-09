import type { ReactNode } from 'react';
import '@/ui/global.css';

// The original's metadata export used a title template ('%s | Acme Dashboard').
// Waku has no metadata merging — see the note in this example's README — so each
// page renders its own full title and this layout carries only the description.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <meta
        name="description"
        content="The official Next.js Learn Dashboard built with App Router."
      />
      {children}
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
