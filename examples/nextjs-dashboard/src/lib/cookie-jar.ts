import { AsyncLocalStorage } from 'node:async_hooks';
import * as cookie from 'cookie';

// Waku has no cookie-writing API: server components and server functions can
// read request headers, but only middleware owns the response. This module is
// the bridge — middleware/cookies.ts opens a jar around the request, anything
// downstream (a server action, an API route) drops Set-Cookie strings into it,
// and the middleware appends them to the response on the way out.
//
// In Next.js this whole file is `cookies().set(...)`.

type CookieJar = { setCookies: string[] };

const storage = new AsyncLocalStorage<CookieJar>();

export const runWithCookieJar = <T>(fn: () => Promise<T>): Promise<T> =>
  storage.run({ setCookies: [] }, fn);

export const getCookieJar = () => storage.getStore();

// Reads back a cookie queued earlier in this same request. Without this, a
// server action that logs a user in and redirects cannot be followed by a render
// that sees the session: unstable_getHeaders() only ever reports the cookies the
// browser sent. Next.js's cookies() store reads through pending writes the same way.
export const readPendingCookie = (name: string): string | undefined => {
  const jar = storage.getStore();
  if (!jar) {
    return undefined;
  }
  for (let i = jar.setCookies.length - 1; i >= 0; i -= 1) {
    const parsed = cookie.parseSetCookie(jar.setCookies[i]!);
    if (parsed?.name === name) {
      return parsed.value;
    }
  }
  return undefined;
};

export const queueSetCookie = (value: string) => {
  const jar = storage.getStore();
  if (!jar) {
    throw new Error(
      'No cookie jar in scope. Is src/middleware/cookies.ts registered?',
    );
  }
  jar.setCookies.push(value);
};
