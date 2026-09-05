import type { Collection, Menu, Page, Product } from './types';

// Stand-in for a Shopify storefront so the example runs with no credentials.
// In a real migration this file does not exist: lib/shopify/ moves across
// untouched apart from the four Next.js APIs listed in the README.

const image = (name: string, alt: string) => ({
  url: `/products/${name}.svg`,
  altText: alt,
  width: 1000,
  height: 1000,
});

const money = (amount: string) => ({ amount, currencyCode: 'USD' });

type Seed = {
  handle: string;
  title: string;
  description: string;
  price: string;
  maxPrice?: string;
  tags: string[];
  options: { name: string; values: string[] }[];
  collections: string[];
  createdAt: string;
  bestSellingRank: number;
};

const seeds: Seed[] = [
  {
    handle: 'acme-circles-t-shirt',
    title: 'Acme Circles T-Shirt',
    description: 'A soft cotton t-shirt with the Acme circles print.',
    price: '20.00',
    tags: [],
    options: [
      { name: 'Size', values: ['S', 'M', 'L', 'XL'] },
      { name: 'Color', values: ['Black', 'White'] },
    ],
    collections: ['t-shirts', 'hidden-homepage-featured-items'],
    createdAt: '2026-01-04T10:00:00Z',
    bestSellingRank: 1,
  },
  {
    handle: 'acme-drawstring-bag',
    title: 'Acme Drawstring Bag',
    description: 'A lightweight drawstring bag for the gym or the beach.',
    price: '12.00',
    tags: [],
    options: [{ name: 'Color', values: ['Black', 'Sand'] }],
    collections: ['accessories', 'hidden-homepage-carousel'],
    createdAt: '2026-02-11T10:00:00Z',
    bestSellingRank: 4,
  },
  {
    handle: 'acme-cup',
    title: 'Acme Cup',
    description: 'A 12oz ceramic cup. Dishwasher safe, microwave optional.',
    price: '15.00',
    tags: [],
    options: [{ name: 'Size', values: ['12oz', '16oz'] }],
    collections: ['accessories', 'hidden-homepage-featured-items'],
    createdAt: '2026-01-22T10:00:00Z',
    bestSellingRank: 3,
  },
  {
    handle: 'acme-hoodie',
    title: 'Acme Hoodie',
    description: 'Heavyweight fleece hoodie with a kangaroo pocket.',
    price: '50.00',
    maxPrice: '55.00',
    tags: [],
    options: [
      { name: 'Size', values: ['S', 'M', 'L', 'XL'] },
      { name: 'Color', values: ['Charcoal', 'Sand'] },
    ],
    collections: ['t-shirts', 'hidden-homepage-featured-items'],
    createdAt: '2026-03-02T10:00:00Z',
    bestSellingRank: 2,
  },
  {
    handle: 'acme-mug',
    title: 'Acme Mug',
    description: 'An enamel camp mug that survives being dropped.',
    price: '18.00',
    tags: [],
    options: [{ name: 'Color', values: ['White', 'Blue'] }],
    collections: ['accessories', 'hidden-homepage-carousel'],
    createdAt: '2026-02-25T10:00:00Z',
    bestSellingRank: 5,
  },
  {
    handle: 'acme-cap',
    title: 'Acme Cap',
    description: 'Six-panel cap with an embroidered logo and a metal clasp.',
    price: '24.00',
    tags: [],
    options: [{ name: 'Color', values: ['Black', 'Sand'] }],
    collections: ['accessories', 'hidden-homepage-carousel'],
    createdAt: '2026-03-14T10:00:00Z',
    bestSellingRank: 6,
  },
  {
    handle: 'acme-sticker-pack',
    title: 'Acme Sticker Pack',
    description: 'Ten die-cut vinyl stickers. Weatherproof, laptop-safe.',
    price: '8.00',
    tags: [],
    options: [{ name: 'Pack', values: ['Ten', 'Twenty'] }],
    collections: ['accessories', 'hidden-homepage-carousel'],
    createdAt: '2026-03-20T10:00:00Z',
    bestSellingRank: 7,
  },
  {
    handle: 'acme-prototype-tee',
    title: 'Acme Prototype Tee',
    description: 'Not for sale. Carries the hidden tag, so it stays unindexed.',
    price: '0.00',
    tags: ['nextjs-frontend-hidden'],
    options: [{ name: 'Size', values: ['M'] }],
    collections: [],
    createdAt: '2026-03-28T10:00:00Z',
    bestSellingRank: 8,
  },
];

const buildVariants = (seed: Seed) => {
  const [first, second] = seed.options;
  const combos: { name: string; value: string }[][] = [];
  for (const a of first?.values ?? ['Default Title']) {
    if (second) {
      for (const b of second.values) {
        combos.push([
          { name: first!.name, value: a },
          { name: second.name, value: b },
        ]);
      }
    } else {
      combos.push([{ name: first?.name ?? 'Title', value: a }]);
    }
  }
  return combos.map((selectedOptions, i) => ({
    id: `${seed.handle}-variant-${i}`,
    title: selectedOptions.map((o) => o.value).join(' / '),
    // One variant per product is out of stock, so the variant selector has
    // something to disable.
    availableForSale: !(i === 1 && combos.length > 2),
    selectedOptions,
    price: money(i === combos.length - 1 && seed.maxPrice ? seed.maxPrice : seed.price),
  }));
};

export const products: Product[] = seeds.map((seed) => {
  const variants = buildVariants(seed);
  const images = [
    image(seed.handle, seed.title),
    image(`${seed.handle}-alt`, `${seed.title}, alternate view`),
  ];
  return {
    id: `gid://acme/Product/${seed.handle}`,
    handle: seed.handle,
    availableForSale: seed.tags.length === 0,
    title: seed.title,
    description: seed.description,
    descriptionHtml: `<p>${seed.description}</p>`,
    options: seed.options.map((option, i) => ({
      id: `${seed.handle}-option-${i}`,
      name: option.name,
      values: option.values,
    })),
    priceRange: {
      maxVariantPrice: money(seed.maxPrice ?? seed.price),
      minVariantPrice: money(seed.price),
    },
    variants,
    featuredImage: images[0]!,
    images,
    seo: { title: seed.title, description: seed.description },
    tags: seed.tags,
    updatedAt: seed.createdAt,
  };
});

export const productCollections = new Map(
  seeds.map((seed) => [seed.handle, seed.collections]),
);

export const productOrder = new Map(
  seeds.map((seed) => [
    seed.handle,
    { createdAt: seed.createdAt, bestSellingRank: seed.bestSellingRank },
  ]),
);

export const collections: Collection[] = [
  {
    handle: '',
    title: 'All',
    description: 'All products',
    seo: { title: 'All', description: 'All products' },
    path: '/search',
    updatedAt: '2026-03-28T10:00:00Z',
  },
  {
    handle: 't-shirts',
    title: 'Shirts',
    description: 'Tees and hoodies',
    seo: { title: 'Shirts', description: 'Tees and hoodies' },
    path: '/search/t-shirts',
    updatedAt: '2026-03-02T10:00:00Z',
  },
  {
    handle: 'accessories',
    title: 'Accessories',
    description: 'Cups, bags, caps and stickers',
    seo: {
      title: 'Accessories',
      description: 'Cups, bags, caps and stickers',
    },
    path: '/search/accessories',
    updatedAt: '2026-03-20T10:00:00Z',
  },
];

export const menus: Record<string, Menu[]> = {
  'next-js-frontend-header-menu': [
    { title: 'All', path: '/search' },
    { title: 'Shirts', path: '/search/t-shirts' },
    { title: 'Accessories', path: '/search/accessories' },
  ],
  'next-js-frontend-footer-menu': [
    { title: 'Home', path: '/' },
    { title: 'About', path: '/about' },
    { title: 'Terms & Conditions', path: '/terms-conditions' },
  ],
};

export const pages: Page[] = [
  {
    id: 'gid://acme/Page/about',
    title: 'About',
    handle: 'about',
    body: '<p>Acme sells a small number of well made things. This storefront is a migration of Next.js Commerce to Waku.</p>',
    bodySummary: 'Acme sells a small number of well made things.',
    seo: { title: 'About', description: 'About Acme' },
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'gid://acme/Page/terms-conditions',
    title: 'Terms & Conditions',
    handle: 'terms-conditions',
    body: '<p>Everything here is fictional. No orders are placed and no payments are taken.</p>',
    bodySummary: 'Everything here is fictional.',
    seo: {
      title: 'Terms & Conditions',
      description: 'Terms and conditions',
    },
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
  },
];
