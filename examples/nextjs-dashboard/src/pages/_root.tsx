import type { ReactNode } from 'react';

export default function RootElement({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body className="font-inter antialiased">{children}</body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
