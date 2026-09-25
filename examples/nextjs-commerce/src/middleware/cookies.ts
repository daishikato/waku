import type { MiddlewareHandler } from 'hono';
import { getCookieJar, runWithCookieJar } from '../lib/cookie-jar';

const cookies = (): MiddlewareHandler => {
  return async (c, next) => {
    await runWithCookieJar(async () => {
      await next();
      const jar = getCookieJar();
      if (!jar?.setCookies.length || !c.res) {
        return;
      }
      const headers = new Headers(c.res.headers);
      for (const value of jar.setCookies) {
        headers.append('set-cookie', value);
      }
      c.res = new Response(c.res.body, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers,
      });
    });
  };
};

export default cookies;
