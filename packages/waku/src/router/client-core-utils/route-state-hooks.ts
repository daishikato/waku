import {
  startTransition,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  unstable_fetchRsc as fetchRsc,
  unstable_registerRscReloadListener as registerRscReloadListener,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../../minimal/client.js';
import { encodeRoutePath } from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  clearCaches,
  createRscParams,
  forEachRegisteredLazySlice,
  learnStaticFromElements,
} from './caches.js';
import { getRouteFromElements } from './element-meta.js';
import { fetchSlice } from './slice.js';

export const useInitialRoute = (proposed: RouteProps): RouteProps => {
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const routeFromElements = getRouteFromElements(elements);
  const resolvedRoute =
    routeFromElements && routeFromElements.path !== proposed.path
      ? { ...routeFromElements, hash: proposed.hash }
      : proposed;
  const initialHashRef = useRef(resolvedRoute.hash);
  // state, not a ref: it is read during render
  const [initialRoute] = useState(() => ({ ...resolvedRoute, hash: '' }));
  // starts empty so hydration matches the server, then the effect fills it
  const [restoredHash, setRestoredHash] = useState('');
  useEffect(() => {
    // Browser bindings restore the address-bar hash after hydration.
    // An in-memory host should not use this hook.
    setRestoredHash(window.location.hash || initialHashRef.current);
  }, []);
  return useMemo(
    () => ({ ...initialRoute, hash: restoredHash }),
    [initialRoute, restoredHash],
  );
};

export const useHmrRefetch = ({
  getSettledRoute,
  onBeforeRefetch,
}: {
  getSettledRoute: () => RouteProps;
  onBeforeRefetch?: () => void;
}): void => {
  const mergeElements = useMergeElements();
  useEffect(() => {
    if (import.meta.hot) {
      const refetchRouteOnHmr = () => {
        onBeforeRefetch?.();
        clearCaches();
        const settledRoute = getSettledRoute();
        startTransition(() => {
          // the reload clears the set, so the response has to teach it again
          void mergeElements(
            fetchRsc(
              encodeRoutePath(settledRoute.path),
              createRscParams(settledRoute.query),
            ),
          ).then(learnStaticFromElements, () => {});
          forEachRegisteredLazySlice((id) => {
            fetchSlice(id, mergeElements, { replace: true });
          });
        });
      };
      return registerRscReloadListener(refetchRouteOnHmr);
    }
  }, [getSettledRoute, mergeElements, onBeforeRefetch]);
};
