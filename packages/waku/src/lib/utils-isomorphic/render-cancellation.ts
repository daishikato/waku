const cancellation = Symbol.for('waku.render-cancellation');

export const CANCEL_RENDER_DIGEST = 'WAKU_CANCEL_RENDER';

/** Identifies a local or Flight-decoded cancellation; rethrow it in custom catch blocks. */
export const isRenderCancellation = (error: unknown): boolean =>
  error === cancellation ||
  (typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    error.digest === CANCEL_RENDER_DIGEST);

/**
 * Stops the current server component or function by throwing a cancellation
 * signal. Other render tasks can continue. On the client, a cancelled Slot
 * renders as empty. During SSR, cancellation uses the nearest Suspense fallback
 * or switches to client rendering. It carries no status or navigation data.
 * Catch blocks and custom error boundaries must rethrow the signal.
 *
 * @example
 * import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
 *
 * if (!allowed) cancelRender();
 */
export function cancelRender(): never {
  throw cancellation;
}

export { cancellation as renderCancellation };
