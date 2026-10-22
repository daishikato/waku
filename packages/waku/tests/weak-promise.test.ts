import { describe, expect, test } from 'vitest';
import { createWeakPromise } from '../src/lib/utils-server/weak-promise.js';

describe('createWeakPromise', () => {
  test('notifies synchronously and preserves the first empty string', async () => {
    const { promise, resolve } = createWeakPromise();
    const seen: (string | undefined)[] = [];
    const result = promise.then((value) => {
      seen.push(value);
      return value;
    });
    resolve('');
    resolve('ignored');
    expect(seen).toEqual(['']);
    await expect(result).resolves.toBe('');
    await expect(Promise.resolve(promise)).resolves.toBe('');
  });

  test('handler failures reject the chained promise', async () => {
    const { promise, resolve } = createWeakPromise();
    const result = promise.then(() => {
      throw new Error('handler failed');
    });
    resolve('value');
    await expect(result).rejects.toThrow('handler failed');
  });
});
