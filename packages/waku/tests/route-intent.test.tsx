// @vitest-environment happy-dom

import { Suspense, act, use, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ETAGS_ID } from '../src/lib/utils-isomorphic/etags.js';
import { unstable_callServerRsc } from '../src/minimal/client-runtime.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import {
  Children_UNSTABLE as Children,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useFetchRsc_UNSTABLE as useFetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../src/minimal/client.js';
import { Router, useRouter } from '../src/router/client.js';
import {
  INTENT_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  encodeSliceId,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/router-protocol.js';
import type { RouteIntentData } from '../src/router/isomorphic-utils/router-protocol.js';

type Elements = Readonly<Record<string | symbol, unknown>>;
const mocks = vi.hoisted(() => ({
  queue: [] as Array<Elements | Promise<Elements>>,
}));

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: (response: Promise<Response>) => {
      const elements = mocks.queue.shift();
      if (!elements) {
        throw new Error('Unexpected RSC request');
      }
      return response.then(() => elements);
    },
    encodeReply: async () => '',
    createTemporaryReferenceSet: () => new Map(),
  },
}));

const defer = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};
const deferIntent = () => {
  const deferred = defer<string | undefined>();
  return {
    promise: deferred.promise,
    resolve: (value: RouteIntentData | null) =>
      deferred.resolve(value === null ? undefined : JSON.stringify(value)),
  };
};
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
let root: ReturnType<typeof createRoot> | undefined;
let controls: {
  router: ReturnType<typeof useRouter>;
  fetch: ReturnType<typeof useFetchRsc>;
  merge: ReturnType<typeof useMergeElements>;
  elements: Elements;
};

const Probe = () => {
  const router = useRouter();
  const fetch = useFetchRsc();
  const merge = useMergeElements();
  const elements = use(useElementsPromise());
  useLayoutEffect(() => {
    controls = { router, fetch, merge, elements };
  });
  return <output>{router.path}</output>;
};

const payload = (
  path: string,
  intent: Promise<string | undefined> = Promise.resolve(undefined),
  isStatic = false,
): Elements => ({
  root: (
    <>
      <Probe />
      <Children />
    </>
  ),
  [ROUTE_ID]: [path, ''],
  [IS_STATIC_ID]: isStatic,
  [INTENT_ID]: intent,
  [getRouteSlotId(path)]: <p>Page {path}</p>,
  ...(isStatic ? { [ETAGS_ID]: { root: 1, [getRouteSlotId(path)]: 1 } } : {}),
});

const mount = async (path = '/one') => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Suspense fallback={null}>
        <Router initialRoute={{ path, query: '', hash: '' }} />
      </Suspense>,
    );
    await flush();
  });
  return container;
};

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}')),
  );
  window.history.replaceState({}, '', '/one');
  clearInitialRscEntries();
  mocks.queue = [];
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  clearInitialRscEntries();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('a navigation commits while its intent stays pending', async () => {
  mocks.queue.push(payload('/one'));
  const view = await mount();
  const pending = deferIntent();
  mocks.queue.push(payload('/two', pending.promise));
  await act(async () => {
    await controls.router.push('/two');
    await flush();
  });
  expect(window.location.pathname).toBe('/two');
  expect(view.textContent).toContain('Page /two');
  expect(controls.elements[INTENT_ID]).toBe(pending.promise);
});

test.each(['slice', 'action'] as const)(
  'a normal %s response preserves the active page intent',
  async (kind) => {
    const pending = deferIntent();
    mocks.queue.push(payload('/one', pending.promise));
    const view = await mount();
    mocks.queue.push({
      [INTENT_ID]: Promise.resolve(undefined),
      sidebar: 'updated',
      _value: 'saved',
    });
    await act(async () => {
      if (kind === 'action') {
        expect(await unstable_callServerRsc('actions#save', [])).toBe('saved');
      } else {
        await controls.merge(await controls.fetch(encodeSliceId('sidebar')));
      }
      await flush();
    });
    expect(controls.elements[INTENT_ID]).toBe(pending.promise);
    mocks.queue.push(payload('/done'));
    await act(async () => {
      pending.resolve({ status: 307, location: '/done' });
      await flush();
    });
    expect(window.location.pathname).toBe('/done');
    expect(view.textContent).toContain('Page /done');
  },
);

test('a partial intent is observed while the page intent remains pending', async () => {
  const page = deferIntent();
  const partial = deferIntent();
  mocks.queue.push(payload('/one', page.promise));
  const view = await mount();
  mocks.queue.push({ [INTENT_ID]: partial.promise, sidebar: 'loaded' });
  await act(async () => {
    await controls.merge(await controls.fetch(encodeSliceId('sidebar')));
    await flush();
  });
  expect(controls.elements[INTENT_ID]).toBe(page.promise);
  mocks.queue.push(payload('/done'));
  await act(async () => {
    partial.resolve({ status: 307, location: '/done' });
    await flush();
  });
  expect(window.location.pathname).toBe('/done');
  expect(view.textContent).toContain('Page /done');
  page.resolve(null);
});

test('a late page intent cannot leave a reused static route', async () => {
  window.history.replaceState({}, '', '/two');
  mocks.queue.push(payload('/two', Promise.resolve(undefined), true));
  const view = await mount('/two');
  const pending = deferIntent();
  mocks.queue.push(payload('/one', pending.promise));
  await act(async () => {
    await controls.router.push('/one');
    await flush();
  });
  await act(async () => {
    await controls.router.push('/two');
    await flush();
  });
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    pending.resolve({ status: 307, location: '/wrong' });
    await flush();
  });
  expect(window.location.pathname).toBe('/two');
  expect(view.textContent).toContain('Page /two');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
});

test('a partial intent is ignored after its originating route was left', async () => {
  const pending = deferIntent();
  mocks.queue.push(payload('/one'));
  const view = await mount();
  mocks.queue.push({ [INTENT_ID]: pending.promise, sidebar: 'loaded' });
  await act(async () => {
    await controls.merge(await controls.fetch(encodeSliceId('sidebar')));
    await flush();
  });
  mocks.queue.push(payload('/two'));
  await act(async () => {
    await controls.router.push('/two');
    await flush();
  });
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    pending.resolve({ status: 307, location: '/wrong' });
    await flush();
  });
  expect(window.location.pathname).toBe('/two');
  expect(view.textContent).toContain('Page /two');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
});

test('an old intent cannot supersede a newer pending navigation', async () => {
  const pending = deferIntent();
  const destination = defer<Elements>();
  mocks.queue.push(payload('/one', pending.promise));
  const view = await mount();
  mocks.queue.push(destination.promise);
  let pushed!: Promise<void>;
  await act(async () => {
    pushed = controls.router.push('/two');
    await flush();
  });
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    pending.resolve({ status: 307, location: '/wrong' });
    await flush();
  });
  expect(view.textContent).toContain('Page /one');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
  await act(async () => {
    destination.resolve(payload('/two'));
    await pushed;
    await flush();
  });
  expect(window.location.pathname).toBe('/two');
  expect(view.textContent).toContain('Page /two');
});

test('a cached static intent is followed again on a new route activation', async () => {
  mocks.queue.push(payload('/one'));
  const view = await mount();
  const intent: RouteIntentData = { status: 307, location: '/done' };
  mocks.queue.push(
    payload('/gate', Promise.resolve(JSON.stringify(intent)), true),
    payload('/done', Promise.resolve(undefined), true),
  );
  await act(async () => {
    await controls.router.push('/gate');
    await flush();
  });
  expect(window.location.pathname).toBe('/done');
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    await controls.router.push('/gate');
    await flush();
  });
  expect(window.location.pathname).toBe('/done');
  expect(view.textContent).toContain('Page /done');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
});

test('a hash-only navigation preserves the current server-render intent', async () => {
  const pending = deferIntent();
  mocks.queue.push(payload('/one', pending.promise));
  const view = await mount();
  await act(async () => {
    await controls.router.push('/one#section');
    await flush();
  });
  expect(controls.elements[INTENT_ID]).toBe(pending.promise);
  mocks.queue.push(payload('/done'));
  await act(async () => {
    pending.resolve({ status: 307, location: '/done' });
    await flush();
  });
  expect(window.location.pathname).toBe('/done');
  expect(view.textContent).toContain('Page /done');
});
