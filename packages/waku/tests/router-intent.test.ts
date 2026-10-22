import { describe, expect, it, vi } from 'vitest';
import { createElementCache } from '../src/router/define-router-utils/element-cache.js';
import {
  getRouteIntent,
  runWithRouterStore,
} from '../src/router/define-router-utils/request-store.js';
import {
  notFound,
  redirect,
  unstable_defineRouter,
} from '../src/router/server.js';

vi.mock('../src/server.js', () => ({
  serializeRsc: async (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value)),
  deserializeRsc: async (bytes: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(bytes)),
}));

const withinRequest = <T>(fn: () => T, signal?: AbortSignal) =>
  runWithRouterStore(
    { req: new Request('http://localhost/page', signal ? { signal } : {}) },
    fn,
  );

const expectPending = async (promise: PromiseLike<unknown>) => {
  const settled = vi.fn();
  void Promise.resolve(promise).then(settled, settled);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(settled).not.toHaveBeenCalled();
};

describe('intent metadata', () => {
  it('encodes Unicode destinations and preserves existing escapes in HTTP headers', async () => {
    const router = unstable_defineRouter({
      resolve: async () => {
        redirect('/日本?q=café&escaped=%2F');
        return null;
      },
      getHas404: async () => false,
    });
    const response = await router.handleRequest(
      {
        type: 'http',
        pathname: '/unicode',
        req: new Request('http://localhost/base/unicode'),
      },
      {
        renderRsc: vi.fn(),
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(307);
    expect((response as Response).headers.get('location')).toBe(
      '/base/%E6%97%A5%E6%9C%AC?q=caf%C3%A9&escaped=%2F',
    );
  });

  it('delivers a resolver intent even when no route elements are returned', async () => {
    const router = unstable_defineRouter({
      resolve: async () => {
        redirect('/destination');
        return null;
      },
      getHas404: async () => false,
    });
    const renderRsc = vi.fn(async (elements) => {
      expect(JSON.parse((await elements.INTENT)!)).toEqual({
        status: 307,
        location: '/destination',
      });
      return new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
    });
    await router.handleRequest(
      {
        type: 'rsc',
        pathname: '/RSC/R/resolve',
        rscPath: 'R/resolve',
        rscParams: undefined,
        req: new Request('http://localhost/RSC/R/resolve'),
      },
      {
        renderRsc,
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    expect(renderRsc).toHaveBeenCalledOnce();
  });

  it('does not await an unused intent for an API response', async () => {
    let intent: ReturnType<typeof getRouteIntent> | undefined;
    const router = unstable_defineRouter({
      resolve: async () => async () => {
        intent = getRouteIntent();
        return new Response('api');
      },
      getHas404: async () => false,
    });
    await router.handleRequest(
      {
        type: 'http',
        pathname: '/api',
        req: new Request('http://localhost/api'),
      },
      {
        renderRsc: vi.fn(),
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    await expectPending(intent!.promise);
  });

  it('propagates metadata errors without awaiting an unused intent', async () => {
    let intent: ReturnType<typeof getRouteIntent> | undefined;
    const failure = new Error('metadata unavailable');
    const router = unstable_defineRouter({
      resolve: async () => null,
      unstable_interceptors: [
        async (next) => {
          intent = getRouteIntent();
          return next();
        },
      ],
    });
    await expect(
      router.handleRequest(
        {
          type: 'http',
          pathname: '/page',
          req: new Request('http://localhost/page'),
        },
        {
          renderRsc: vi.fn(),
          renderHtml: vi.fn(),
          renderHtmlFallback: vi.fn(),
          loadBuildMetadata: vi.fn().mockRejectedValue(failure),
        },
      ),
    ).rejects.toBe(failure);
    await expectPending(intent!.promise);
  });

  it('executes a no-JavaScript action once when notFound renders the 404 page', async () => {
    const route = {
      elements: {
        root: { immutable: false, render: () => 'root' },
        route: { immutable: false, render: () => 'page' },
      },
    };
    const router = unstable_defineRouter({
      resolve: async () => route,
      getHas404: async () => true,
    });
    const formState = { message: 'missing' };
    const tryAction = vi.fn(async () => {
      notFound();
      return { action: true as const, formState };
    });
    const renderHtml = vi.fn(
      async (_stream, _html, options) =>
        new Response('page', { status: options.status }),
    );
    const response = await router.handleRequest(
      {
        type: 'http',
        pathname: '/posted',
        req: new Request('http://localhost/posted', { method: 'POST' }),
        tryAction,
      },
      {
        renderRsc: vi.fn(
          async () =>
            new ReadableStream({
              start(controller) {
                controller.close();
              },
            }),
        ),
        renderHtml,
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    expect(tryAction).toHaveBeenCalledOnce();
    expect((response as Response).status).toBe(404);
    expect(renderHtml.mock.calls.at(-1)![2]).toEqual(
      expect.objectContaining({ status: 404, formState }),
    );
  });

  it('honors a resolver notFound before a no-SSR fallback', async () => {
    const router = unstable_defineRouter({
      resolve: async () => {
        notFound();
        return {
          noSsr: true,
          elements: {
            root: { immutable: false, render: () => null },
            route: { immutable: false, render: () => null },
          },
        };
      },
      getHas404: async () => false,
    });
    const renderHtmlFallback = vi.fn();
    const response = await router.handleRequest(
      {
        type: 'http',
        pathname: '/client',
        req: new Request('http://localhost/client'),
      },
      {
        renderRsc: vi.fn(),
        renderHtml: vi.fn(),
        renderHtmlFallback,
        loadBuildMetadata: vi.fn(),
      },
    );
    expect((response as Response).status).toBe(404);
    expect(renderHtmlFallback).not.toHaveBeenCalled();
  });

  it('records navigation without throwing or consuming the normal return value', async () => {
    await withinRequest(async () => {
      const intent = getRouteIntent();
      const value = (() => {
        try {
          redirect('/login');
        } catch {
          throw new Error('navigation was thrown');
        }
        return { saved: true };
      })();
      expect(value).toEqual({ saved: true });
      expect(JSON.parse((await intent.promise)!)).toEqual({
        status: 307,
        location: '/login',
      });
    });
  });

  it('ignores intents from an aborted request', async () => {
    const controller = new AbortController();
    await withinRequest(async () => {
      const intent = getRouteIntent();
      controller.abort();
      notFound();
      await expectPending(intent.promise);
      expect(intent.value).toBeUndefined();
    }, controller.signal);
  });

  it('isolates concurrent requests and keeps the first intent per request', async () => {
    const gate = Promise.withResolvers<void>();
    const first = withinRequest(async () => {
      const intent = getRouteIntent();
      await gate.promise;
      redirect('/first');
      notFound();
      return intent.promise;
    });
    const second = withinRequest(async () => {
      const intent = getRouteIntent();
      notFound();
      return intent.promise;
    });
    gate.resolve();
    expect(JSON.parse((await first)!)).toEqual({
      status: 307,
      location: '/first',
    });
    expect(JSON.parse((await second)!)).toEqual({ status: 404 });
  });

  it('persists a cached slot intent and replays it in a new request', async () => {
    const saved = vi.fn();
    const cache = createElementCache(saved);
    await withinRequest(async () => {
      await cache.set('slot/route', () => {
        redirect('/cached');
        return 'cached element';
      });
      expect(getRouteIntent().value).toEqual({
        status: 307,
        location: '/cached',
      });
    });
    const [id, entry] = saved.mock.calls[0]!;
    expect(entry.intent).toEqual({ status: 307, location: '/cached' });
    const restored = createElementCache();
    restored.preload(id, entry);
    await withinRequest(async () => {
      expect(await restored.get(id)).toBe('cached element');
      expect(JSON.parse((await getRouteIntent().promise)!)).toEqual(
        entry.intent,
      );
    });
  });

  it('forwards a cached slot intent before the source finishes', async () => {
    const gate = Promise.withResolvers<void>();
    await withinRequest(async () => {
      const cache = createElementCache();
      const first = cache.set('first', async () => {
        redirect('/first');
        await gate.promise;
        return 'first slot';
      });
      await cache.set('second', () => {
        redirect('/second');
        return 'second slot';
      });
      expect(getRouteIntent().value).toEqual({
        status: 307,
        location: '/first',
      });
      gate.resolve();
      await first;
      await cache.get('first');
    });
  });

  it('does not forward callbacks from a completed cache capture', async () => {
    const gate = Promise.withResolvers<void>();
    const saved = vi.fn();
    const cache = createElementCache(saved);
    await withinRequest(async () => {
      let detached!: Promise<void>;
      await cache.set('slot', () => {
        detached = gate.promise.then(() => redirect('/detached'));
        return 'cached element';
      });
      gate.resolve();
      await detached;
      expect(getRouteIntent().value).toBeUndefined();
      expect(saved.mock.calls[0]![1].intent).toBeUndefined();
      expect(await cache.get('slot')).toBe('cached element');
      expect(getRouteIntent().value).toBeUndefined();
    });
  });

  it('preserves a cached intent when its first requesting client aborts', async () => {
    const controller = new AbortController();
    const gate = Promise.withResolvers<void>();
    const cache = createElementCache(vi.fn());
    await withinRequest(async () => {
      const pending = cache.set('slot', async () => {
        await gate.promise;
        redirect('/cached');
        return 'cached element';
      });
      controller.abort();
      gate.resolve();
      await pending;
      expect(getRouteIntent().value).toBeUndefined();
    }, controller.signal);
    await withinRequest(async () => {
      expect(await cache.get('slot')).toBe('cached element');
      expect(getRouteIntent().value).toEqual({
        status: 307,
        location: '/cached',
      });
    });
  });
});
