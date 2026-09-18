import * as cookie from 'cookie';
import { unstable_getHeaders as getHeaders } from 'waku/router/server';
import { readPendingCookie, setCookie } from '../cookie-jar';
import { HIDDEN_PRODUCT_TAG } from '../constants';
import {
  collections as allCollections,
  menus,
  pages,
  productCollections,
  productOrder,
  products,
} from './fixture-data';
import type { Cart, CartItem, Collection, Menu, Page, Product } from './types';

// The Shopify client, with the same exported surface the components already
// import. Three things differ from the Next.js original:
//
//   1. `"use cache"` + cacheTag/cacheLife/revalidateTag are gone. Waku has no
//      framework cache: static pages are built once and dynamic ones run per
//      request. Add caching deliberately (waku-cache) if you measure a need.
//   2. `cookies()` becomes unstable_getHeaders() for reads and the cookie jar
//      in lib/cookie-jar.ts for writes.
//   3. NextRequest/NextResponse in revalidate() become Request/Response.
//
// The data itself comes from ./fixture-data so the example runs without a
// Shopify store. A real migration keeps its own fetch layer unchanged.

const CART_COOKIE = 'cartId';

const readCookie = (name: string) => {
  const pending = readPendingCookie(name);
  if (pending !== undefined) {
    return pending;
  }
  return cookie.parseCookie(getHeaders()['cookie'] ?? '')[name];
};

// Carts live in memory for the lifetime of the server process, keyed by the id
// in the cookie. A real backend keeps them wherever it already does.
const carts = new Map<string, Cart>();

const emptyCart = (id: string): Cart => ({
  id,
  checkoutUrl: '/checkout',
  cost: {
    subtotalAmount: { amount: '0.00', currencyCode: 'USD' },
    totalAmount: { amount: '0.00', currencyCode: 'USD' },
    totalTaxAmount: { amount: '0.00', currencyCode: 'USD' },
  },
  lines: [],
  totalQuantity: 0,
});

const findVariant = (merchandiseId: string) => {
  for (const product of products) {
    const variant = product.variants.find((v) => v.id === merchandiseId);
    if (variant) {
      return { product, variant };
    }
  }
  return undefined;
};

const recost = (cart: Cart): Cart => {
  const total = cart.lines.reduce(
    (sum, line) => sum + Number(line.cost.totalAmount.amount),
    0,
  );
  const amount = total.toFixed(2);
  return {
    ...cart,
    cost: {
      subtotalAmount: { amount, currencyCode: 'USD' },
      totalAmount: { amount, currencyCode: 'USD' },
      totalTaxAmount: { amount: '0.00', currencyCode: 'USD' },
    },
    totalQuantity: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
  };
};

const lineFor = (merchandiseId: string, quantity: number): CartItem => {
  const found = findVariant(merchandiseId);
  if (!found) {
    throw new Error(`Unknown variant: ${merchandiseId}`);
  }
  const { product, variant } = found;
  return {
    id: `line-${merchandiseId}`,
    quantity,
    cost: {
      totalAmount: {
        amount: (Number(variant.price.amount) * quantity).toFixed(2),
        currencyCode: variant.price.currencyCode,
      },
    },
    merchandise: {
      id: variant.id,
      title: variant.title,
      selectedOptions: variant.selectedOptions,
      product: {
        id: product.id,
        handle: product.handle,
        title: product.title,
        featuredImage: product.featuredImage,
      },
    },
  };
};

const requireCart = () => {
  const cartId = readCookie(CART_COOKIE);
  const cart = cartId ? carts.get(cartId) : undefined;
  if (!cart) {
    throw new Error('No cart');
  }
  return cart;
};

const save = (cart: Cart) => {
  const next = recost(cart);
  carts.set(next.id!, next);
  return next;
};

export async function createCart(): Promise<Cart> {
  const id = `cart-${Math.random().toString(36).slice(2, 10)}`;
  const cart = emptyCart(id);
  carts.set(id, cart);
  return cart;
}

export async function addToCart(
  lines: { merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  const cart = requireCart();
  const next = { ...cart, lines: [...cart.lines] };
  for (const { merchandiseId, quantity } of lines) {
    const existing = next.lines.findIndex(
      (line) => line.merchandise.id === merchandiseId,
    );
    if (existing >= 0) {
      const current = next.lines[existing]!;
      next.lines[existing] = lineFor(
        merchandiseId,
        current.quantity + quantity,
      );
    } else {
      next.lines.push(lineFor(merchandiseId, quantity));
    }
  }
  return save(next);
}

export async function removeFromCart(lineIds: string[]): Promise<Cart> {
  const cart = requireCart();
  return save({
    ...cart,
    lines: cart.lines.filter((line) => !lineIds.includes(line.id!)),
  });
}

export async function updateCart(
  lines: { id: string; merchandiseId: string; quantity: number }[],
): Promise<Cart> {
  const cart = requireCart();
  const next = { ...cart, lines: [...cart.lines] };
  for (const { id, merchandiseId, quantity } of lines) {
    const index = next.lines.findIndex((line) => line.id === id);
    if (index >= 0) {
      next.lines[index] = lineFor(merchandiseId, quantity);
    }
  }
  return save(next);
}

export async function getCart(): Promise<Cart | undefined> {
  const cartId = readCookie(CART_COOKIE);
  if (!cartId) {
    return undefined;
  }
  return carts.get(cartId);
}

/** Called from a server action; writes the cart cookie through the jar. */
export function setCartCookie(cartId: string) {
  setCookie(CART_COOKIE, cartId);
}

export async function getCollection(
  handle: string,
): Promise<Collection | undefined> {
  return allCollections.find((collection) => collection.handle === handle);
}

const sortProducts = (
  list: Product[],
  sortKey?: string,
  reverse?: boolean,
): Product[] => {
  const sorted = [...list];
  if (sortKey === 'PRICE') {
    sorted.sort(
      (a, b) =>
        Number(a.priceRange.minVariantPrice.amount) -
        Number(b.priceRange.minVariantPrice.amount),
    );
  } else if (sortKey === 'CREATED_AT') {
    sorted.sort((a, b) =>
      (productOrder.get(a.handle)?.createdAt ?? '').localeCompare(
        productOrder.get(b.handle)?.createdAt ?? '',
      ),
    );
  } else if (sortKey === 'BEST_SELLING') {
    sorted.sort(
      (a, b) =>
        (productOrder.get(a.handle)?.bestSellingRank ?? 0) -
        (productOrder.get(b.handle)?.bestSellingRank ?? 0),
    );
  }
  return reverse ? sorted.reverse() : sorted;
};

const visibleProducts = () =>
  products.filter((product) => !product.tags.includes(HIDDEN_PRODUCT_TAG));

export async function getCollectionProducts({
  collection,
  reverse,
  sortKey,
}: {
  collection: string;
  reverse?: boolean;
  sortKey?: string;
}): Promise<Product[]> {
  const inCollection = products.filter((product) =>
    (productCollections.get(product.handle) ?? []).includes(collection),
  );
  return sortProducts(inCollection, sortKey, reverse);
}

export async function getCollections(): Promise<Collection[]> {
  return allCollections;
}

export async function getMenu(handle: string): Promise<Menu[]> {
  return menus[handle] ?? [];
}

export async function getPage(handle: string): Promise<Page | undefined> {
  return pages.find((page) => page.handle === handle);
}

export async function getPages(): Promise<Page[]> {
  return pages;
}

export async function getProduct(
  handle: string,
): Promise<Product | undefined> {
  return products.find((product) => product.handle === handle);
}

export async function getProductRecommendations(
  productId: string,
): Promise<Product[]> {
  return visibleProducts()
    .filter((product) => product.id !== productId)
    .slice(0, 4);
}

export async function getProducts({
  query,
  reverse,
  sortKey,
}: {
  query?: string;
  reverse?: boolean;
  sortKey?: string;
}): Promise<Product[]> {
  const term = query?.trim().toLowerCase();
  const matched = visibleProducts().filter(
    (product) =>
      !term ||
      product.title.toLowerCase().includes(term) ||
      product.description.toLowerCase().includes(term),
  );
  return sortProducts(matched, sortKey, reverse);
}

/**
 * The storefront webhook. In the original it invalidates cache tags; there is
 * no cache here, so it only reports that it was reached. Keep the endpoint if
 * you add caching later — that is where invalidation belongs.
 */
export async function revalidate(req: Request): Promise<Response> {
  const secret = new URL(req.url).searchParams.get('secret');
  if (!secret || secret !== process.env.STORE_REVALIDATION_SECRET) {
    console.error('Invalid revalidation secret.');
    return Response.json({ status: 401 }, { status: 401 });
  }

  return Response.json({ status: 200, revalidated: false, now: Date.now() });
}
