import type { ReactNode } from 'react';
import type { Unstable_ElementSource as ElementSource } from 'waku/minimal/server';
import { deserializeRsc, serializeRsc } from 'waku/server';
import type { RouteIntentData } from '../isomorphic-utils/router-protocol.js';
import { captureRouteIntent, getRouteIntent } from './request-store.js';

export const ROOT_SLOT_ID = 'root';

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

export const base64ToBytes = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

export type CacheId = string;

export const createElementCache = (
  onSerialize?: (
    cacheId: CacheId,
    serialized: string,
    intent?: RouteIntentData,
  ) => void,
) => {
  const cache = new Map<CacheId, Promise<Uint8Array>>();
  const intents = new Map<CacheId, RouteIntentData>();
  return {
    preload: (
      cacheId: CacheId,
      bytes: Uint8Array,
      intent?: RouteIntentData,
    ) => {
      cache.set(cacheId, Promise.resolve(bytes));
      if (intent) {
        intents.set(cacheId, intent);
      } else {
        intents.delete(cacheId);
      }
    },
    has: (cacheId: CacheId) => cache.has(cacheId),
    get: (cacheId: CacheId) => {
      const cachedBytes = cache.get(cacheId);
      if (!cachedBytes) {
        return undefined;
      }
      return cachedBytes.then((bytes) => {
        const intent = intents.get(cacheId);
        if (intent) {
          getRouteIntent().record(intent);
        }
        return deserializeRsc(bytes);
      }) as Promise<ReactNode>;
    },
    set: (cacheId: CacheId, element: unknown) => {
      if (cache.has(cacheId)) {
        return;
      }
      const bytesPromise = captureRouteIntent(async () =>
        serializeRsc(typeof element === 'function' ? await element() : element),
      ).then(({ result, intent }) => {
        if (intent) {
          intents.set(cacheId, intent);
        }
        return result;
      });
      cache.set(cacheId, bytesPromise);
      if (onSerialize) {
        return bytesPromise.then((bytes) => {
          onSerialize(cacheId, bytesToBase64(bytes), intents.get(cacheId));
        });
      }
    },
  };
};

export type ElementCache = ReturnType<typeof createElementCache>;

export const cacheElementSource = (
  source: ElementSource,
  cacheId: CacheId,
  cache: ElementCache,
): ElementSource =>
  source.immutable
    ? {
        ...source,
        render: async () => {
          if (!cache.has(cacheId)) {
            await cache.set(cacheId, source.render);
          }
          return cache.get(cacheId);
        },
      }
    : source;

export const getSlotCacheId = (slotId: string): CacheId => `slot/${slotId}`;

export const getElementCacheId = (
  slotId: string,
  source: ElementSource & { cacheKey?: string },
) =>
  source.cacheKey === undefined
    ? getSlotCacheId(slotId)
    : `key/${source.cacheKey}`;
