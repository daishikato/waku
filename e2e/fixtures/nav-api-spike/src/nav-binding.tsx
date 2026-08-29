'use client';

import {
  Component,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';
import {
  type Unstable_FollowDecision as FollowDecision,
  unstable_MAX_FOLLOWS_PER_NAVIGATION as MAX_FOLLOWS_PER_NAVIGATION,
  unstable_ROUTE_ID as ROUTE_ID,
  type Unstable_RouteProps as RouteProps,
  type Unstable_RouterHost as RouterHost,
  unstable_RouterHostContext as RouterHostContext,
  unstable_buildMergePatch as buildMergePatch,
  unstable_decideFollow as decideFollow,
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getRouteFromElements as getRouteFromElements,
  unstable_getRouteSlotId as getRouteSlotId,
  unstable_getRouteUrl as getRouteUrl,
  unstable_has404FromElements as has404FromElements,
  unstable_isFollowable as isFollowable,
  unstable_learnStaticFromElements as learnStaticFromElements,
  unstable_load as load,
  unstable_parseRoute as parseRoute,
  unstable_prefetchRoute as prefetchRoute,
  useInitialRoute_UNSTABLE as useInitialRoute,
  useInitialRscParams_UNSTABLE as useInitialRscParams,
} from 'waku/router/client-core';
import { settleNavigateFinished } from './settle-navigate-finished.js';

// one root; a second instance would keep this on the host. replace follows
// increment it; a user push/traverse starts a new chain.
const slotFollows = { current: 0 };
let lastFollowHref = '';

const FollowRedirect = ({
  decision,
}: {
  decision: Extract<FollowDecision, { type: 'follow' | 'leave' }>;
}) => {
  const href = decision.url.href;
  useEffect(() => {
    if (decision.type === 'leave') {
      window.location.replace(href);
      return;
    }
    if (href === lastFollowHref) {
      return;
    }
    lastFollowHref = href;
    slotFollows.current += 1;
    void window.navigation.navigate(href, {
      history: 'replace',
      info: { follows: slotFollows.current },
    });
  }, [decision.type, href]);
  return null;
};

// slot-thrown stop/none must leave this boundary so the fallback can render
class FollowFailure extends Component<
  { children: ReactNode },
  { error: unknown | null }
> {
  state: { error: unknown | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      const message = error instanceof Error ? error.message : String(error);
      return <p data-testid="follow-error">{message}</p>;
    }
    return this.props.children;
  }
}

// the fetch can succeed with the throwing page still in the payload.
// path changes remount via key; query/hash follows clear the held error in
// place — remounting on query would rebuild the page on every setSearch.
// a hash-only slot redirect cannot be resolved (no refetch); decideFollow
// must stop it as a loop after the address bar moves.
class FollowBoundary extends Component<
  {
    routeKey: string;
    route: RouteProps;
    has404: boolean;
    children: ReactNode;
  },
  { error: unknown | null; routeKey: string }
> {
  state: { error: unknown | null; routeKey: string } = {
    error: null,
    routeKey: this.props.routeKey,
  };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  static getDerivedStateFromProps(
    props: { routeKey: string },
    state: { routeKey: string },
  ) {
    return props.routeKey !== state.routeKey
      ? { error: null, routeKey: props.routeKey }
      : null;
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      if (!isFollowable(error)) {
        throw error;
      }
      const { route, has404 } = this.props;
      const decision = decideFollow(
        error,
        {
          route,
          url: getRouteUrl(route),
          follows: slotFollows.current,
        },
        { has404, maxFollows: MAX_FOLLOWS_PER_NAVIGATION },
      );
      if (decision.type === 'stop' || decision.type === 'none') {
        throw decision.type === 'stop' ? decision.error : error;
      }
      return <FollowRedirect decision={decision} />;
    }
    return this.props.children;
  }
}

const NavBinding = ({ fallbackRoute }: { fallbackRoute: RouteProps }) => {
  const elements = use(useElementsPromise());
  const mergeElements = useMergeElements();
  const routeFallback = useInitialRoute(fallbackRoute);
  const resolvedRef = useRef(elements);
  useLayoutEffect(() => {
    resolvedRef.current = elements;
  }, [elements]);
  const has404 = has404FromElements(elements);
  // hash-only navigations skip load; the host still has to report the current hash
  const [hash, setHash] = useState('');
  useEffect(() => {
    const navigation = window.navigation;
    if (!navigation) {
      return;
    }
    const sync = () => setHash(window.location.hash);
    sync();
    navigation.addEventListener('currententrychange', sync);
    return () => navigation.removeEventListener('currententrychange', sync);
  }, []);
  const route = useMemo((): RouteProps => {
    const fromElements = getRouteFromElements(elements);
    return fromElements ? { ...fromElements, hash } : routeFallback;
  }, [elements, routeFallback, hash]);

  const run = useEffectEvent(
    async (next: RouteProps, signal: AbortSignal, follows: number) => {
      const base = resolvedRef.current;
      const settled = getRouteFromElements(base) ?? routeFallback;
      const outcome = await load(next, {
        signal,
        has404,
        settled,
        base,
        follows,
      });
      if (outcome.type === 'aborted') {
        return;
      }
      slotFollows.current = Math.max(slotFollows.current, outcome.follows);
      if (outcome.type === 'external') {
        window.location.replace(outcome.url.href);
        throw outcome.error;
      }
      if (outcome.type === 'failed') {
        throw outcome.error;
      }
      // intercept already committed the requested URL; a follow must rewrite this entry
      if (outcome.url.href !== window.location.href) {
        window.history.replaceState(null, '', outcome.url.href);
      }
      if (outcome.type === 'reused') {
        await mergeElements({
          [ROUTE_ID]: [outcome.route.path, outcome.route.query],
        });
        return;
      }
      const patch = buildMergePatch(
        { route: outcome.route, elements: outcome.elements },
        resolvedRef.current,
        base,
        { settled },
      );
      await mergeElements(patch);
      learnStaticFromElements(outcome.elements);
    },
  );

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
      const next = parseRoute(dest);
      const current = parseRoute(new URL(window.location.href));
      if (next.path === current.path && next.query === current.query) {
        return;
      }
      const info = event.info as
        { scroll?: boolean; follows?: number } | undefined;
      if (event.navigationType !== 'replace') {
        slotFollows.current = 0;
        lastFollowHref = '';
      } else if (typeof info?.follows === 'number') {
        slotFollows.current = info.follows;
      }
      event.intercept({
        handler: () => run(next, event.signal, slotFollows.current),
        // useSetSearch passes scroll: false; intercept defaults to after-transition
        ...(info?.scroll === false ? { scroll: 'manual' } : {}),
      });
    };
    navigation.addEventListener('navigate', onNavigate);
    prefetchRoute({ path: '/hello/spike', query: '', hash: '' });
    return () => navigation.removeEventListener('navigate', onNavigate);
  }, []);

  const navigate = useCallback<RouterHost['navigate']>((href, opts) => {
    const result = window.navigation.navigate(href, {
      history: opts.history,
      info: { scroll: opts.scroll },
    });
    return settleNavigateFinished(result.finished);
  }, []);
  const host = useMemo(
    (): RouterHost => ({ route, navigate }),
    [route, navigate],
  );

  return (
    <RouterHostContext value={host}>
      <Slot id="root">
        <FollowFailure key={route.path}>
          <FollowBoundary
            key={route.path}
            routeKey={`${route.path}\0${route.query}\0${route.hash}`}
            route={route}
            has404={has404}
          >
            <Slot id={getRouteSlotId(route.path)} />
          </FollowBoundary>
        </FollowFailure>
      </Slot>
    </RouterHostContext>
  );
};

export const NavRouter = () => {
  const [fallback] = useState(() => parseRoute(new URL(window.location.href)));
  const initialRscPath = encodeRoutePath(fallback.path);
  const initialRscParams = useInitialRscParams(initialRscPath, fallback.query);
  return (
    <Root initialRscPath={initialRscPath} initialRscParams={initialRscParams}>
      <NavBinding fallbackRoute={fallback} />
    </Root>
  );
};
