import bcrypt from 'bcryptjs';
import * as cookie from 'cookie';
import { jwtVerify, SignJWT } from 'jose';
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

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-only-insecure-session-secret',
);

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
    .sign(secret);

  queueSetCookie(
    cookie.stringifySetCookie({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
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

/** Same check, for middleware, which runs outside the render scope. */
export const verifySessionToken = async (
  token: string | undefined,
): Promise<Session | null> => {
  if (!token) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, secret);
    return { email: payload.email as string, name: payload.name as string };
  } catch {
    return null;
  }
};

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
