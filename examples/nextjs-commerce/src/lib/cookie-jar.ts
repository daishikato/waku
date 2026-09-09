import { AsyncLocalStorage } from 'node:async_hooks';
import * as cookie from 'cookie';
import { getEnv } from 'waku';

// Waku has no cookie-writing API. Server code reads request headers; only
// middleware owns the response. So middleware/cookies.ts opens a jar around each
// request, code downstream drops Set-Cookie strings into it, and the middleware
// attaches them on the way out. Reading also goes through the jar, so a cookie
// written earlier in the same request is visible to the render that follows —
// which is what makes "create a cart, then show it" work.
//
// In Next.js this file is `cookies()`.

type CookieJar = { setCookies: string[] };

const storage = new AsyncLocalStorage<CookieJar>();

export const runWithCookieJar = <T>(fn: () => Promise<T>): Promise<T> =>
  storage.run({ setCookies: [] }, fn);

export const getCookieJar = () => storage.getStore();

export const setCookie = (name: string, value: string) => {
  const jar = storage.getStore();
  if (!jar) {
    throw new Error(
      'No cookie jar in scope. Is src/middleware/cookies.ts registered?',
    );
  }
  jar.setCookies.push(
    cookie.stringifySetCookie({
      name,
      value,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      // Secure unless this is plain-http local development.
      secure: getEnv('NODE_ENV') !== 'development',
      maxAge: 60 * 60 * 24 * 30,
    }),
  );
};

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
