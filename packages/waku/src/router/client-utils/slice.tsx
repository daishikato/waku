import { use, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  Slot_UNSTABLE as Slot,
  unstable_fetchRsc as fetchRsc,
  unstable_isImmutableElement as isImmutableElement,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../../minimal/client.js';
import {
  encodeSliceId,
  getSliceSlotId,
} from '../isomorphic-utils/route-path.js';
import { registerLazySlice } from './caches.js';

type Elements = Record<string | symbol, unknown>;

export type SliceId = string;

const fetchingSlices = new Map<SliceId, Promise<Elements>>();

export const fetchSlice = (
  id: SliceId,
  mergeElements: ReturnType<typeof useMergeElements>,
  options?: { replace?: boolean },
) => {
  if (fetchingSlices.has(id) && !options?.replace) {
    return;
  }
  const request = fetchRsc(encodeSliceId(id));
  fetchingSlices.set(id, request);
  request
    .then((result) => {
      if (fetchingSlices.get(id) === request) {
        return mergeElements(result);
      }
    })
    .catch((e) => {
      console.error('Failed to fetch slice:', e);
    })
    .finally(() => {
      if (fetchingSlices.get(id) === request) {
        fetchingSlices.delete(id);
      }
    });
};

export const getInFlightSliceCount = (): number => fetchingSlices.size;

export const resetSliceFetches = (): void => {
  fetchingSlices.clear();
};

/**
 * Renders a named slice slot from the current RSC elements. With `lazy`, the
 * first visit fetches the slice if it is missing or mutable; later visits reuse
 * an immutable copy. The lazy `fallback` is shown only while the slot is absent
 * from the elements map (it does not reappear on a later refetch — see FIXME).
 */
export function Slice({
  id,
  children,
  ...props
}: {
  id: SliceId;
  children?: ReactNode;
} & (
  | {
      lazy?: false;
    }
  | {
      lazy: true;
      fallback: ReactNode;
    }
)) {
  const mergeElements = useMergeElements();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const needsToFetchSlice =
    props.lazy &&
    (!(slotId in elements) || !isImmutableElement(elements, slotId));
  useEffect(() => {
    if (props.lazy) {
      return registerLazySlice(id);
    }
  }, [id, props.lazy]);
  useEffect(() => {
    if (needsToFetchSlice) {
      fetchSlice(id, mergeElements);
    }
  }, [id, mergeElements, needsToFetchSlice]);
  if (props.lazy && !(slotId in elements)) {
    // FIXME the fallback doesn't show on refetch after the first one.
    return props.fallback;
  }
  return <Slot id={slotId}>{children}</Slot>;
}
