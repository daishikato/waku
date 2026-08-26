import { describe, expect, test } from 'vitest';
import { ETAG_ID_PREFIX, IMMUTABLE_ETAG } from '../src/lib/utils/etags.js';
import {
  canCommitInstantly,
  getRouteFromElements,
  has404FromElements,
  isMetaKey,
  isStaticFromElements,
} from '../src/router/client-utils/element-meta.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
} from '../src/router/isomorphic-utils/route-path.js';

describe('element meta', () => {
  test('getRouteFromElements reads ROUTE_ID and leaves hash empty', () => {
    expect(getRouteFromElements({ [ROUTE_ID]: ['/a', 'q=1'] })).toEqual({
      path: '/a',
      query: 'q=1',
      hash: '',
    });
    expect(getRouteFromElements({})).toBeUndefined();
  });

  test('isStaticFromElements and has404FromElements are presence checks', () => {
    expect(isStaticFromElements({ [IS_STATIC_ID]: true })).toBe(true);
    expect(isStaticFromElements({})).toBe(false);
    expect(has404FromElements({ [HAS404_ID]: true })).toBe(true);
    expect(has404FromElements({})).toBe(false);
  });

  test('isMetaKey is only the three server-owned keys', () => {
    expect(isMetaKey(ROUTE_ID)).toBe(true);
    expect(isMetaKey(HAS404_ID)).toBe(true);
    expect(isMetaKey(IS_STATIC_ID)).toBe(true);
    expect(isMetaKey(`${IS_STATIC_ID}:layout:/`)).toBe(false);
    expect(isMetaKey('route:/a')).toBe(false);
  });
});

describe('canCommitInstantly', () => {
  const immutable = (slotId: string) => ({
    [ETAG_ID_PREFIX + slotId]: IMMUTABLE_ETAG,
  });

  test('true when the resolved elements hold an immutable route slot', () => {
    expect(
      canCommitInstantly('route:/a', immutable('route:/a'), undefined),
    ).toBe(true);
  });

  test('true when only the prefetched elements hold it', () => {
    expect(canCommitInstantly('route:/a', {}, immutable('route:/a'))).toBe(
      true,
    );
  });

  test('false without an immutable etag for the slot', () => {
    expect(
      canCommitInstantly(
        'route:/a',
        { [ETAG_ID_PREFIX + 'route:/a']: 'W/"mutable"' },
        null,
      ),
    ).toBe(false);
  });
});
