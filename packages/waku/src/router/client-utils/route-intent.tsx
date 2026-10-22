import {
  startTransition,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  unstable_combineElements as combineElements,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useRegisterRscEnhancer_UNSTABLE as useRegisterRscEnhancer,
} from 'waku/minimal/client';
import { MAX_FOLLOWS_PER_NAVIGATION } from '../client-core-utils/error-route.js';
import { getRouteUrl, isSameRscRoute } from '../client-core-utils/route-url.js';
import { pathnameToRoutePath } from '../isomorphic-utils/route-path.js';
import {
  INTENT_ID,
  getRouteFromElements,
  has404FromElements,
} from '../isomorphic-utils/router-protocol.js';
import type { RouteIntentData } from '../isomorphic-utils/router-protocol.js';
import { RouterContext } from './router-context.js';
import { getRouterState } from './router-state.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

export const RouteIntent = () => {
  const elements = use(useElementsPromise());
  const router = use(RouterContext);
  const getElements = router?.getElements;
  const getPendingRoute = router?.getPendingRoute;
  const changeRoute = router?.changeRoute;
  const registerRscEnhancer = useRegisterRscEnhancer();
  const followed = useRef(
    new WeakMap<
      PromiseLike<string | undefined>,
      ReturnType<typeof getRouterState>
    >(),
  );
  const mounted = useRef(true);
  const [failure, setFailure] = useState<{ error: unknown }>();
  const [missing, setMissing] = useState<{
    scope: ReturnType<typeof getRouterState>;
  }>();
  const currentScope = getRouterState(elements);
  // A suspended Root merge can hide layout effects without unmounting.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const follow = useCallback(
    (
      intent: RouteIntentData,
      source: Elements,
      pending: PromiseLike<string | undefined>,
    ) => {
      const state = getRouterState(source);
      if (
        !changeRoute ||
        (followed.current.has(pending) &&
          followed.current.get(pending) === state)
      ) {
        return;
      }
      const pendingRoute = getPendingRoute?.();
      const sourceRoute = getRouteFromElements(source);
      if (
        pendingRoute &&
        sourceRoute &&
        !isSameRscRoute(pendingRoute, sourceRoute)
      ) {
        return;
      }
      if (getElements && getElements()[INTENT_ID] !== source[INTENT_ID]) {
        return;
      }
      if (
        intent.status === 404 &&
        getRouteFromElements(source)?.path === '/404'
      ) {
        return;
      }
      followed.current.set(pending, state);
      if ('location' in intent && !intent.location.startsWith('/')) {
        window.location.replace(intent.location);
        return;
      }
      if (intent.status === 404 && !has404FromElements(source)) {
        setMissing({ scope: getRouterState(source) });
        return;
      }
      const follows = (state?.follows ?? 0) + 1;
      if (follows > MAX_FOLLOWS_PER_NAVIGATION) {
        setFailure({ error: new Error('too many redirect or 404 follows') });
        return;
      }
      const requestedUrl = new URL(
        state?.url ?? window.location.href,
        window.location.href,
      );
      const location =
        'location' in intent
          ? new URL(intent.location, requestedUrl)
          : requestedUrl;
      const target = {
        path:
          intent.status === 404
            ? '/404'
            : pathnameToRoutePath(location.pathname),
        query: location.searchParams.toString(),
        hash: intent.status === 404 ? '' : location.hash,
      };
      const url = intent.status === 404 ? requestedUrl : getRouteUrl(target);
      startTransition(() => {
        changeRoute(target, {
          shouldScroll: true,
          history: 'replace',
          refetch: true,
          url,
          follows,
        }).catch((error: unknown) => setFailure({ error }));
      });
    },
    [changeRoute, getElements, getPendingRoute],
  );

  useEffect(() => {
    const pending = elements[INTENT_ID] as
      PromiseLike<string | undefined> | undefined;
    if (!pending) {
      return;
    }
    let active = true;
    Promise.resolve(pending).then(
      (value) => {
        if (active && value !== undefined) {
          follow(JSON.parse(value) as RouteIntentData, elements, pending);
        }
      },
      (error: unknown) => {
        if (active) {
          setFailure({ error });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [elements, follow]);

  useLayoutEffect(() => {
    if (!getElements) {
      return;
    }
    const unregister = registerRscEnhancer(
      (next) => async (path, params, options) => {
        const scope = getRouterState(getElements());
        const result = await next(path, params, options);
        const pending = result.elements[INTENT_ID] as
          Promise<string | undefined> | undefined;
        if (
          !pending ||
          (options.type !== 'call' && getRouteFromElements(result.elements))
        ) {
          return result;
        }
        Promise.resolve(pending).then(
          (value) => {
            if (
              !mounted.current ||
              options.signal?.aborted ||
              getRouterState(getElements()) !== scope
            ) {
              return;
            }
            if (value !== undefined) {
              follow(
                JSON.parse(value) as RouteIntentData,
                getElements(),
                pending,
              );
            }
          },
          (error: unknown) => {
            if (
              mounted.current &&
              !options.signal?.aborted &&
              getRouterState(getElements()) === scope
            ) {
              setFailure({ error });
            }
          },
        );
        return {
          ...result,
          elements: combineElements({}, result.elements, {
            filter: (key) => key !== INTENT_ID,
          }),
        };
      },
      110,
    );
    return () => {
      unregister();
    };
  }, [follow, getElements, registerRscEnhancer]);

  if (failure) {
    throw failure.error;
  }
  if (missing && missing.scope === currentScope) {
    return <h1>Not Found</h1>;
  }
  return null;
};
