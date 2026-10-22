type WeakPromiseState = {
  value: string | undefined;
  resolve: (value: string) => void;
  halt: () => void;
  subscribe: (listener: (value: string) => void) => void;
};

const weakPromises = new WeakMap<object, WeakPromiseState>();

export const getWeakPromise = (value: unknown) =>
  typeof value === 'object' && value !== null
    ? weakPromises.get(value)
    : undefined;

/**
 * Creates a fulfill-only weak thenable for a top-level `renderRsc` element.
 * It does not keep rendering open. Values must be strings; callers encode data.
 * The first resolution wins and listeners run synchronously. Only values
 * published while rendering is active reach the receiver. An unused decoded
 * promise may remain pending or resolve undefined; observe it without suspending.
 * HTML consumers need a completion signal when it remains pending.
 *
 * @example
 * const { promise, resolve } = unstable_createWeakPromise<string>();
 * // Pass `promise` as an element; rendering code can call `resolve('value')`.
 */
export function createWeakPromise<T extends string = string>(): {
  promise: PromiseLike<T | undefined>;
  resolve: (value: T) => void;
} {
  let closed = false;
  const listeners = new Set<(value: string) => void>();
  const state: WeakPromiseState = {
    value: undefined,
    resolve(value) {
      if (closed) {
        return;
      }
      closed = true;
      state.value = value;
      for (const listener of listeners) {
        listener(value);
      }
      listeners.clear();
    },
    halt() {
      closed = true;
      listeners.clear();
    },
    subscribe(listener) {
      if (state.value !== undefined) {
        listener(state.value);
      } else if (!closed) {
        listeners.add(listener);
      }
    },
  };
  const promise = {
    get status() {
      return state.value !== undefined
        ? ('fulfilled' as const)
        : ('pending_weak' as const);
    },
    get value() {
      return state.value as T | undefined;
    },
    then<TResult1 = T | undefined, TResult2 = never>(
      onFulfilled?:
        ((value: T | undefined) => TResult1 | PromiseLike<TResult1>) | null,
      _onRejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return new Promise((resolve, reject) => {
        state.subscribe((value) => {
          try {
            resolve(
              onFulfilled
                ? onFulfilled(value as T)
                : (value as unknown as TResult1),
            );
          } catch (error) {
            reject(error);
          }
        });
      });
    },
  };
  weakPromises.set(promise, state);
  return { promise, resolve: (value: T) => state.resolve(value) };
}
