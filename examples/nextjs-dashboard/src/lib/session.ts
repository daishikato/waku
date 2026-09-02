import bcrypt from 'bcryptjs';
import * as cookie from 'cookie';
import { jwtVerify, SignJWT } from 'jose';
import { getEnv } from 'waku';
import { unstable_getHeaders as getHeaders } from 'waku/router/server';
import { queueSetCookie, readPendingCookie } from './cookie-jar';
import { sql } from './db';
import type { User } from './definitions';

// next-auth v5 is built on Next.js internals (its middleware wrapper, route
// handlers and `next/headers`), so it cannot come along. What the app actually
// used it for was small: verify a password, remember the user in a cookie, read
// that cookie back, and clear it. That is this file.
//
// A framework-agnostic library such as @auth/core or better-auth slots in the
// same way — the shape below is what it would replace.

const SESSION_COOKIE = 'session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

// A missing secret must not silently become a guessable key. Development gets
// a fixed one so `pnpm dev` works out of the box; production has to set it.
// The check runs on first use rather than at module scope: this module is
// evaluated during `waku build` too, where a runtime secret need not exist.
// getEnv() is Waku's runtime-agnostic env access; process.env does not exist
// on Cloudflare Workers or Deno.
let secret: Uint8Array | undefined;
const getSecret = () => {
  if (!secret) {
    const value =
      getEnv('SESSION_SECRET') ||
      (getEnv('NODE_ENV') !== 'production' ? 'dev-only-insecure-secret' : '');
    if (value.length < 24) {
      throw new Error(
        'Set SESSION_SECRET to a random string of at least 24 characters.',
      );
    }
    secret = new TextEncoder().encode(value);
  }
  return secret;
};

export type Session = { email: string; name: string };

const getUser = async (email: string): Promise<User | undefined> => {
  const users = await sql<User>`SELECT * FROM users WHERE email=${email}`;
  return users[0];
};

/** Replaces signIn('credentials', ...). Returns false on bad credentials. */
export const signIn = async (email: string, password: string) => {
  const user = await getUser(email);
  if (!user) {
    return false;
  }
  if (!(await bcrypt.compare(password, user.password))) {
    return false;
  }

  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());

  queueSetCookie(
    cookie.stringifySetCookie({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      // Secure unless this is plain-http local development. Not keyed on
      // NODE_ENV === 'production': Cloudflare Workers set no NODE_ENV.
      secure: getEnv('NODE_ENV') !== 'development',
      maxAge: SESSION_MAX_AGE,
    }),
  );

  return true;
};

/** Replaces signOut(). */
export const signOut = () => {
  queueSetCookie(
    cookie.stringifySetCookie({
      name: SESSION_COOKIE,
      value: '',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: getEnv('NODE_ENV') !== 'development',
      maxAge: 0,
    }),
  );
};

/** Replaces auth() in server components and server functions. */
export const auth = async (): Promise<Session | null> => {
  // A cookie queued earlier in this request wins over the one the browser sent,
  // so the render that follows signIn()/signOut() sees the new session.
  const pending = readPendingCookie(SESSION_COOKIE);
  if (pending !== undefined) {
    return verifySessionToken(pending || undefined);
  }
  const cookies = cookie.parseCookie(getHeaders()['cookie'] ?? '');
  return verifySessionToken(cookies[SESSION_COOKIE]);
};

/**
 * For data access and mutations: throws instead of redirecting.
 *
 * This is the authorization boundary. A layout that redirects only covers the
 * layout: Waku renders the layout and the page as separate slots of one RSC
 * response, so an unauthenticated request for /RSC/R/dashboard.txt still ran
 * the page — and every query in it — until data.ts started checking for itself.
 */
export const requireSession = async (): Promise<Session> => {
  const session = await auth();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
};

/** Same check, for middleware, which runs outside the render scope. */
export const verifySessionToken = async (
  token: string | undefined,
): Promise<Session | null> => {
  if (!token) {
    return null;
  }
  // Resolve the key before the try: a missing SESSION_SECRET is a deployment
  // error and must surface, whereas a bad token is an ordinary "no session".
  const key = getSecret();
  try {
    const { payload } = await jwtVerify(token, key);
    return { email: payload.email as string, name: payload.name as string };
  } catch {
    return null;
  }
};

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
