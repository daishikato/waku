import { unstable_getErrorInfo as getErrorInfo } from 'waku/minimal/client';
import {
  type RouteProps,
  pathnameToRoutePath,
} from '../isomorphic-utils/route-path.js';
import {
  getRouteUrl,
  isInsideBase,
  isSameRscRoute,
  parseRedirectUrl,
  parseRoute,
  redactCredentials,
} from './route-url.js';

/**
 * Whether a caught render error is a redirect or 404 the binding should
 * consider following.
 */
export const isFollowable = (error: unknown) => {
  const info = getErrorInfo(error);
  return info?.status === 404 || !!info?.location;
};

/**
 * Bound on one navigation's follow chain, including slot-thrown redirects
 * after `load` returns.
 */
export const MAX_FOLLOWS_PER_NAVIGATION = 20;

export type FollowDecision =
  | { type: 'follow'; target: RouteProps; url: URL }
  | { type: 'leave'; url: URL }
  | { type: 'stop'; error: unknown }
  | { type: 'none' };

type FollowRequest = {
  route: Pick<RouteProps, 'path' | 'query'>;
  url: URL;
  follows: number;
};

type FollowOptions = { has404: boolean; maxFollows: number };

/**
 * Given a caught error, the route that threw it, and how many follows have
 * already happened, whether to follow, leave the document, or stop.
 * `load` uses this for fetch-time redirects; a slot-thrown redirect happens
 * after `load` returns, so the binding must call it too.
 */
export const decideFollow = (
  error: unknown,
  requested: FollowRequest,
  options: FollowOptions,
): FollowDecision =>
  decideRouteIntent(getErrorInfo(error), requested, options, error);

export const decideRouteIntent = (
  info: ReturnType<typeof getErrorInfo>,
  requested: FollowRequest,
  options: FollowOptions,
  cause?: unknown,
): FollowDecision => {
  let target: RouteProps;
  let url: URL;
  const location = info?.location;
  if (location) {
    const parsed = parseRedirectUrl(location, requested.url);
    if (!parsed) {
      return {
        type: 'stop',
        error: new Error(
          `cannot follow a redirect to ${redactCredentials(location)}`,
          { cause },
        ),
      };
    }
    if (info.unstable_leave || parsed.origin !== window.location.origin) {
      return { type: 'leave', url: parsed };
    }
    if (location.startsWith('/') && !location.startsWith('//')) {
      target = {
        path: pathnameToRoutePath(parsed.pathname),
        query: parsed.searchParams.toString(),
        hash: parsed.hash,
      };
      url = getRouteUrl(target);
    } else {
      if (!isInsideBase(parsed)) {
        return { type: 'leave', url: parsed };
      }
      target = parseRoute(parsed);
      url = parsed;
    }
  } else if (info?.status === 404 && options.has404) {
    target = {
      path: '/404',
      query: requested.url.searchParams.toString(),
      hash: '',
    };
    url = requested.url;
  } else {
    return { type: 'none' };
  }
  if (
    isSameRscRoute(target, requested.route) &&
    url.href === requested.url.href
  ) {
    return {
      type: 'stop',
      error: new Error('detected a navigation loop', { cause }),
    };
  }
  if (requested.follows >= options.maxFollows) {
    return {
      type: 'stop',
      error: new Error('too many redirect or 404 follows', { cause }),
    };
  }
  return { type: 'follow', target, url };
};
