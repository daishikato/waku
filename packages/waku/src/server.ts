import { renderToReadableStream } from 'react-server-dom-webpack/server.edge';
import { sanitizeLog } from './lib/utils-isomorphic/log.js';
import { getDigestIfRenderCancellation } from './lib/utils-isomorphic/render-cancellation.js';
import { bytesToStream, streamToBytes } from './lib/utils-isomorphic/stream.js';

export { getEnv } from './lib/env.js';

export async function serializeRsc(element: unknown): Promise<Uint8Array> {
  return streamToBytes(
    renderToReadableStream(
      element,
      {},
      {
        onError: (e: unknown) => {
          const digest = getDigestIfRenderCancellation(e);
          if (digest) {
            return digest;
          }
          console.error('Error during rendering:', sanitizeLog(e));
        },
      },
    ),
  );
}

export async function deserializeRsc(bytes: Uint8Array): Promise<unknown> {
  // Lazy import to keep the RSC client runtime out of the rsc startup graph.
  const { createFromReadableStream } =
    await import('react-server-dom-webpack/client.edge');
  return createFromReadableStream(bytesToStream(bytes));
}
