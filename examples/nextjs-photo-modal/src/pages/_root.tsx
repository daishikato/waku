import type { ReactNode } from 'react';
import '../global.css';

export default function RootElement({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <title>NextGram</title>
        <meta
          name="description"
          content="A sample Next.js app showing dynamic routing with modals as a route."
        />
      </head>
      <body>
        {children}
        {/* Portal target for the modal, exactly as in the Next.js original. */}
        <div id="modal-root" />
      </body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
