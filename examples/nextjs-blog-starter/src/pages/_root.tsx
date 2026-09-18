import type { ReactNode } from "react";

// Next.js renders <html> and <body> from app/layout.tsx. In Waku the document
// shell lives in this _root.tsx file instead, and _layout.tsx renders inside it.
export default function RootElement({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className="dark:bg-slate-900 dark:text-slate-400">{children}</body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: "static",
  } as const;
};
