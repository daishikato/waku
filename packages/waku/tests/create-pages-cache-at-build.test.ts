import { createElement } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Handlers } from '../src/lib/types.js';
import { createPages } from '../src/router/create-pages.js';
import { combineRouters, defineRouter } from '../src/router/define-router.js';
import { fsRouter } from '../src/router/fs-router.js';

vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn().mockResolvedValue(null),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

const build = async (router: Handlers) => {
  const buildMetadata = new Map<string, string>();
  await router.handleBuild({
    renderRsc: async () => makeStream(),
    renderHtml: async () => new Response('<!doctype html>'),
    rscPathToFileName: (rscPath: string) => `RSC/${rscPath}.txt`,
    saveBuildMetadata: async (key, value) => {
      buildMetadata.set(key, value);
    },
    generateFile: async () => {},
    generateDefaultHtml: async () => {},
    unstable_registerPrunableFile: () => {},
  });
  return buildMetadata;
};

const requestRoute = async (
  router: Handlers,
  path: string,
  buildMetadata: Map<string, string>,
) => {
  const renderRsc = vi.fn(async (_elements: Record<string, unknown>) =>
    makeStream(),
  );
  await router.handleRequest(
    {
      type: 'rsc',
      rscPath: 'R' + path,
      rscParams: undefined,
      pathname: '/RSC/R' + path + '.txt',
      req: new Request('http://localhost/RSC/R' + path + '.txt'),
    },
    {
      renderRsc,
      renderHtml: vi.fn(),
      renderHtmlFallback: vi.fn(),
      loadBuildMetadata: async (key: string) => buildMetadata.get(key),
    },
  );
  return renderRsc.mock.calls[0]?.[0];
};

const Page = () => createElement('p', null, 'page');

const createPagesWithValue = (
  key: string,
  compute: () => Promise<unknown>,
  seen: unknown[],
  path = '/',
) =>
  createPages(async ({ createPage, unstable_cacheAtBuild }) => {
    seen.push(await unstable_cacheAtBuild(key, compute));
    return [createPage({ path, render: 'dynamic', component: Page })];
  });

describe('unstable_cacheAtBuild', () => {
  it('reuses a value computed at build in production', async () => {
    const seen: unknown[] = [];
    const buildMetadata = await build(
      createPagesWithValue('posts', async () => ['a', 'b'], seen),
    );

    const computeInProduction = vi.fn(async () => ['c']);
    await requestRoute(
      createPagesWithValue('posts', computeInProduction, seen),
      '/',
      buildMetadata,
    );

    expect(computeInProduction).not.toHaveBeenCalled();
    expect(seen).toEqual([
      ['a', 'b'],
      ['a', 'b'],
    ]);
  });

  it('computes a value containing a function again in production', async () => {
    const seen: unknown[] = [];
    const buildMetadata = await build(
      createPagesWithValue(
        'codec',
        async () => ({ parse: () => 'build' }),
        seen,
      ),
    );

    const computeInProduction = vi.fn(async () => ({ parse: () => 'runtime' }));
    await requestRoute(
      createPagesWithValue('codec', computeInProduction, seen),
      '/',
      buildMetadata,
    );

    expect(computeInProduction).toHaveBeenCalledOnce();
  });

  it('keeps the saved values of each combined router apart', async () => {
    const seen: unknown[] = [];
    const buildMetadata = await build(
      combineRouters(
        createPagesWithValue('key', async () => 'first', seen, '/first'),
        createPagesWithValue('key', async () => 'second', seen, '/second'),
      ),
    );

    seen.length = 0;
    await requestRoute(
      combineRouters(
        createPagesWithValue('key', async () => 'other', seen, '/first'),
        createPagesWithValue('key', async () => 'other', seen, '/second'),
      ),
      '/first',
      buildMetadata,
    );

    expect(seen.sort()).toEqual(['first', 'second']);
  });

  it('lets fsRouter skip getConfig in production for a page it keeps', async () => {
    const NewsLayout = ({ children }: { children: ReactNode }) =>
      createElement('section', null, children);
    // a static page under a dynamic layout stays in the server bundle
    const getPageConfig = vi.fn(async () => ({ render: 'static' as const }));
    const modules = {
      './pages/news/_layout.tsx': async () => ({
        default: NewsLayout,
        getConfig: async () => ({ render: 'dynamic' as const }),
      }),
      './pages/news/index.tsx': async () => ({
        default: Page,
        getConfig: getPageConfig,
      }),
    };
    const buildMetadata = await build(fsRouter(modules));

    const elements = await requestRoute(
      fsRouter(modules),
      '/news',
      buildMetadata,
    );

    expect(getPageConfig).toHaveBeenCalledOnce();
    expect(elements?.ROUTE).toEqual(['/news', '']);
  });
});

describe('defineRouter build metadata', () => {
  it('initializes once with the string the build saved', async () => {
    const buildMetadata = await build(
      defineRouter({
        resolve: async () => null,
        unstable_getBuildMetadata: async () => 'saved',
      }),
    );

    const initialize = vi.fn(async () => {});
    const router = defineRouter({
      resolve: async () => null,
      unstable_initialize: initialize,
    });
    await Promise.all([
      requestRoute(router, '/foo', buildMetadata),
      requestRoute(router, '/foo', buildMetadata),
    ]);

    expect(initialize).toHaveBeenCalledExactlyOnceWith('saved');
  });
});
