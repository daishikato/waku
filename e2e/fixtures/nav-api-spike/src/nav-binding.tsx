'use client';

import {
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_removeBase as removeBase,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';
// dist, not src: same module instance as waku/router/client
import {
  createRscParams,
  learnStaticFromElements,
  prefetchRoute,
} from '../../../../packages/waku/dist/router/client-utils/caches.js';
import {
  getRouteFromElements,
  has404FromElements,
} from '../../../../packages/waku/dist/router/client-utils/element-meta.js';
import { RouterHostContext } from '../../../../packages/waku/dist/router/client-utils/host.js';
import type { RouterHost } from '../../../../packages/waku/dist/router/client-utils/host.js';
import { load } from '../../../../packages/waku/dist/router/client-utils/load.js';
import { buildMergePatch } from '../../../../packages/waku/dist/router/client-utils/merge-patch.js';
import { useInitialRoute } from '../../../../packages/waku/dist/router/client-utils/route-state-hooks.js';
import {
  encodeRoutePath,
  getRouteSlotId,
  pathnameToRoutePath,
} from '../../../../packages/waku/dist/router/isomorphic-utils/route-path.js';
import type { RouteProps } from '../../../../packages/waku/dist/router/isomorphic-utils/route-path.js';

const parseUrl = (url: URL): RouteProps => ({
  path: pathnameToRoutePath(
    removeBase(url.pathname, import.meta.env.WAKU_CONFIG_BASE_PATH),
  ),
  query: url.searchParams.toString(),
  hash: url.hash,
});

const NavBinding = ({ fallbackRoute }: { fallbackRoute: RouteProps }) => {
  const elements = use(useElementsPromise());
  const mergeElements = useMergeElements();
  const { routeFallback } = useInitialRoute(fallbackRoute);
  const resolvedRef = useRef(elements);
  useLayoutEffect(() => {
    resolvedRef.current = elements;
  }, [elements]);
  const has404 = has404FromElements(elements);
  const route = useMemo((): RouteProps => {
    const fromElements = getRouteFromElements(elements);
    return fromElements
      ? { ...fromElements, hash: window.location.hash }
      : routeFallback;
  }, [elements, routeFallback]);

  const run = useEffectEvent(async (next: RouteProps, signal: AbortSignal) => {
    const base = resolvedRef.current;
    const settled = getRouteFromElements(base) ?? routeFallback;
    const outcome = await load(next, { signal, has404, settled, base });
    if (outcome.type === 'aborted' || outcome.type === 'reused') {
      return;
    }
    if (outcome.type === 'external') {
      window.location.replace(outcome.url.href);
      throw outcome.error;
    }
    if (outcome.type !== 'loaded') {
      throw outcome.error;
    }
    const patch = buildMergePatch(
      { route: outcome.route, elements: outcome.elements },
      resolvedRef.current,
      base,
      { settled },
    );
    await mergeElements(patch);
    learnStaticFromElements(outcome.elements);
  });

  useEffect(() => {
    const navigation = window.navigation;
    if (!navigation) {
      return;
    }
    const onNavigate = (event: NavigateEvent) => {
      if (!event.canIntercept || event.downloadRequest) {
        return;
      }
      const dest = new URL(event.destination.url);
      if (dest.origin !== window.location.origin) {
        return;
      }
      const next = parseUrl(dest);
      const current = parseUrl(new URL(window.location.href));
      if (next.path === current.path && next.query === current.query) {
        return;
      }
      event.intercept({ handler: () => run(next, event.signal) });
    };
    navigation.addEventListener('navigate', onNavigate);
    prefetchRoute({ path: '/hello/spike', query: '', hash: '' });
    return () => navigation.removeEventListener('navigate', onNavigate);
  }, []);

  const navigate = useCallback<RouterHost['navigate']>((href, opts) => {
    const result = window.navigation.navigate(href, { history: opts.history });
    return Promise.resolve(result.finished).then(
      () => {},
      () => {},
    );
  }, []);
  const host = useMemo(
    (): RouterHost => ({ route, navigate }),
    [route, navigate],
  );

  return (
    <RouterHostContext value={host}>
      <Slot id="root">
        <Slot id={getRouteSlotId(route.path)} />
      </Slot>
    </RouterHostContext>
  );
};

export const NavRouter = () => {
  const [fallback] = useState(() => parseUrl(new URL(window.location.href)));
  return (
    <Root
      initialRscPath={encodeRoutePath(fallback.path)}
      initialRscParams={createRscParams(fallback.query)}
    >
      <NavBinding fallbackRoute={fallback} />
    </Root>
  );
};
