/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createCustomError,
  getErrorInfo,
} from '../src/lib/utils-isomorphic/custom-errors.js';
import {
  MAX_FOLLOWS_PER_NAVIGATION,
  decideFollow,
  decideRouteIntent,
  isFollowable,
} from '../src/router/client-core-utils/route-intent.js';
import { parseRoute } from '../src/router/client-core-utils/route-url.js';

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

const requested = (href: string) => new URL(href, window.location.href);
const options = { has404: false, maxFollows: MAX_FOLLOWS_PER_NAVIGATION };
const at = (path: string, query = '', follows = 0) => {
  const url = requested(path + (query && `?${query}`));
  return { route: parseRoute(url), url, follows };
};

describe('decideRouteIntent', () => {
  test('a document location leaves, whatever its origin', () => {
    const sameOrigin = {
      location: '/api/logout',
      unstable_leave: true,
    };
    const other = {
      location: 'https://other.example/next',
      unstable_leave: true,
    };

    // the server already decided no route answers it
    expect(decideRouteIntent(sameOrigin, at('/from'), options)).toEqual({
      type: 'leave',
      url: expect.any(URL),
    });
    expect(
      decideRouteIntent(other, at('/from'), options).type === 'leave',
    ).toBe(true);
  });

  test('an app path redirect keeps the route and rebuilds its url', () => {
    const intent = {
      status: 307,
      location: '/next?a=1#frag',
    };

    const decision = decideRouteIntent(intent, at('/from'), options);

    expect(decision).toEqual({
      type: 'follow',
      target: { path: '/next', query: 'a=1', hash: '#frag' },
      url: expect.any(URL),
    });
    expect(decision.type === 'follow' && decision.url.pathname).toBe('/next');
  });

  test('a base path is added back to an app path redirect', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    const intent = {
      status: 307,
      location: '/next',
    };

    const decision = decideRouteIntent(intent, at('/docs/from'), options);

    expect(decision.type === 'follow' && decision.target.path).toBe('/next');
    expect(decision.type === 'follow' && decision.url.pathname).toBe(
      '/docs/next',
    );
  });

  test('a same origin url is followed as it is', () => {
    const intent = {
      status: 307,
      location: `${window.location.origin}/next`,
    };

    const decision = decideRouteIntent(intent, at('/from'), options);

    expect(decision.type === 'follow' && decision.target.path).toBe('/next');
  });

  test('another origin leaves the app', () => {
    const intent = {
      status: 307,
      location: 'https://example.com/next',
    };

    const decision = decideRouteIntent(intent, at('/from'), options);

    expect(decision).toEqual({ type: 'leave', url: expect.any(URL) });
    expect(decision.type === 'leave' && decision.url.href).toBe(
      'https://example.com/next',
    );
  });

  test('a protocol-relative location belongs to another origin', () => {
    const intent = {
      status: 307,
      location: '//example.com/next',
    };

    const decision = decideRouteIntent(intent, at('/from'), options);

    expect(decision.type).toBe('leave');
  });

  test('credentials never reach the address bar', () => {
    const intent = {
      status: 307,
      location: 'https://user:pw@example.com/next',
    };

    const decision = decideRouteIntent(intent, at('/from'), options);

    expect(decision.type === 'leave' && decision.url.href).toBe(
      'https://example.com/next',
    );
  });

  test('this host named over plaintext keeps the scheme the page is on', () => {
    const secure = 'https://app.example';
    (window as any).happyDOM.setURL(secure + '/from');
    try {
      const intent = {
        // what an app builds from a request url behind an https proxy
        status: 307,
        location: 'http://app.example/next',
      };

      const decision = decideRouteIntent(intent, at('/from'), options);

      expect(decision.type).toBe('follow');
      expect(decision.type === 'follow' && decision.url.protocol).toBe(
        'https:',
      );
    } finally {
      (window as any).happyDOM.setURL('http://localhost:3000/');
    }
  });

  test('a location the browser should not navigate to cannot be followed', () => {
    const intent = {
      status: 307,
      location: 'javascript:alert(1)',
    };

    const decision = decideRouteIntent(intent, at('/from'), options);

    expect(decision).toEqual({
      type: 'stop',
      error: expect.objectContaining({
        message: 'cannot follow a redirect to javascript:alert(1)',
      }),
    });
  });

  test('an unfollowable location does not carry credentials into the message', () => {
    const intent = {
      status: 307,
      location: 'ftp://user:pw@host/x',
    };

    expect(decideRouteIntent(intent, at('/from'), options)).toEqual({
      type: 'stop',
      error: expect.objectContaining({
        message: 'cannot follow a redirect to ftp://host/x',
      }),
    });
  });

  test('a location that is not a url cannot be followed either', () => {
    const intent = {
      status: 307,
      location: 'https://[',
    };

    const decision = decideRouteIntent(intent, at('/from'), options);

    expect(decision).toEqual({
      type: 'stop',
      error: expect.objectContaining({
        message: 'cannot follow a redirect to https://[',
      }),
    });
  });

  test('a 404 goes to the 404 route with the requested query and url', () => {
    const intent = { status: 404 };

    const decision = decideRouteIntent(intent, at('/missing?foo=bar'), {
      ...options,
      has404: true,
    });

    expect(decision.type === 'follow' && decision.target).toEqual({
      path: '/404',
      query: 'foo=bar',
      hash: '',
    });
    expect(decision.type === 'follow' && decision.url.pathname).toBe(
      '/missing',
    );
  });

  test('a 404 without a 404 route is not followed', () => {
    const intent = { status: 404 };

    expect(decideRouteIntent(intent, at('/missing'), options)).toEqual({
      type: 'none',
    });
  });

  test('a plain error is not followed', () => {
    expect(
      decideRouteIntent(getErrorInfo(new Error('boom')), at('/from'), {
        ...options,
        has404: true,
      }),
    ).toEqual({
      type: 'none',
    });
  });
  test('a same origin url outside the base path leaves', () => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/docs/');
    const intent = {
      status: 307,
      location: `${window.location.origin}/login`,
    };
    expect(decideRouteIntent(intent, at('/docs/from'), options).type).toBe(
      'leave',
    );
  });
});

describe('isFollowable', () => {
  test('a redirect or 404 is followable and a plain error is not', () => {
    expect(
      isFollowable(createCustomError('redirect', { location: '/next' })),
    ).toBe(true);
    expect(isFollowable(createCustomError('nf', { status: 404 }))).toBe(true);
    expect(isFollowable(new Error('offline'))).toBe(false);
  });
});

describe('decideFollow', () => {
  const redirectTo = (location: string) =>
    createCustomError('redirect', { status: 307, location });

  test('an error that points nowhere decides nothing', () => {
    expect(decideFollow(new Error('offline'), at('/from'), options)).toEqual({
      type: 'none',
    });
  });

  test('a missing route only follows when the app has a 404 route', () => {
    const error = createCustomError('not found', { status: 404 });

    expect(decideFollow(error, at('/missing'), options)).toEqual({
      type: 'none',
    });
    expect(
      decideFollow(error, at('/missing'), { ...options, has404: true }),
    ).toEqual({
      type: 'follow',
      target: { path: '/404', query: '', hash: '' },
      url: expect.any(URL),
    });
  });

  test('a location the router cannot route to stops', () => {
    const error = redirectTo('javascript:alert(1)');

    expect(decideFollow(error, at('/from'), options)).toMatchObject({
      type: 'stop',
      error: {
        message: 'cannot follow a redirect to javascript:alert(1)',
        cause: error,
      },
    });
  });

  test('a redirect off the origin leaves', () => {
    expect(
      decideFollow(redirectTo('https://other.example/next'), at('/from'), {
        ...options,
        has404: true,
      }),
    ).toEqual({ type: 'leave', url: expect.any(URL) });
  });

  test('a redirect back to the route being fetched stops as a loop', () => {
    expect(
      decideFollow(redirectTo('/here'), at('/here'), options),
    ).toMatchObject({
      type: 'stop',
      error: { message: 'detected a navigation loop' },
    });
  });

  test('the same path with a different query is not a loop', () => {
    expect(
      decideFollow(redirectTo('/here?page=2'), at('/here'), options),
    ).toMatchObject({
      type: 'follow',
      target: { path: '/here', query: 'page=2' },
    });
  });

  test('the same path with only a different hash is not a loop', () => {
    expect(
      decideFollow(redirectTo('/here#section'), at('/here'), options),
    ).toMatchObject({
      type: 'follow',
      target: { path: '/here', query: '', hash: '#section' },
    });
  });

  test('the same path and hash as the current url is a loop', () => {
    expect(
      decideFollow(
        redirectTo('/here#section'),
        {
          route: { path: '/here', query: '' },
          url: requested('/here#section'),
          follows: 0,
        },
        options,
      ),
    ).toMatchObject({
      type: 'stop',
      error: { message: 'detected a navigation loop' },
    });
  });

  test('the last follow inside the budget goes through and the next one stops', () => {
    const error = redirectTo('/next');

    expect(decideFollow(error, at('/from', '', 19), options).type).toBe(
      'follow',
    );
    expect(decideFollow(error, at('/from', '', 20), options)).toMatchObject({
      type: 'stop',
      error: { message: 'too many redirect or 404 follows' },
    });
  });

  test('a loop is reported ahead of a spent budget', () => {
    expect(
      decideFollow(redirectTo('/here'), at('/here', '', 20), options),
    ).toMatchObject({
      type: 'stop',
      error: { message: 'detected a navigation loop' },
    });
  });
});
