import { createElement } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Handlers } from '../src/lib/types.js';
import { createPages } from '../src/router/create-pages.js';
import { combineRouters, defineRouter } from '../src/router/define-router.js';
import type { HandlerInterceptor } from '../src/router/define-router.js';
import { fsRouter } from '../src/router/fs-router.js';
import { serializeRsc } from '../src/server.js';

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

const makeUtils = (
  loadBuildMetadata: (key: string) => Promise<string | undefined> = vi.fn(),
) => ({
  renderRsc: vi.fn(async (_elements: Record<string, unknown>) => makeStream()),
  renderHtml: vi.fn(async () => new Response('ok')),
  renderHtmlFallback: vi.fn(),
  loadBuildMetadata,
});

const makeBuildUtils = () => ({
  renderRsc: vi.fn(async () => makeStream()),
  renderHtml: vi.fn(async () => new Response('<!doctype html>')),
  rscPathToFileName: (rscPath: string) => `RSC/${rscPath}.txt`,
  saveBuildMetadata: vi.fn(async (_key: string, _value: string) => {}),
  generateFile: vi.fn(async () => {}),
  generateDefaultHtml: vi.fn(async () => {}),
  unstable_registerPrunableFile: vi.fn(),
});

const requestRoute = async (
  router: Handlers,
  path: string,
  utils = makeUtils(),
) => {
  const res = await router.handleRequest(
    {
      type: 'rsc',
      rscPath: 'R' + path,
      rscParams: undefined,
      pathname: '/RSC/R' + path + '.txt',
      req: new Request('http://localhost/RSC/R' + path + '.txt'),
    },
    utils,
  );
  return res ? utils.renderRsc.mock.calls[0]![0] : null;
};

const dynamicModule = (component: () => ReactElement) => async () => ({
  default: component,
  getConfig: async () => ({ render: 'dynamic' as const }),
});

const Company = () => createElement('p', null, 'company');
const FsCompany = () => createElement('p', null, 'fs company');
const About = () => createElement('p', null, 'about');

describe('combineRouters', () => {
  it('routes each request to the first router that resolves it', async () => {
    const router = combineRouters(
      createPages(async ({ createPage }) => [
        createPage({ path: '/company', render: 'dynamic', component: Company }),
      ]),
      fsRouter({
        './pages/company.tsx': dynamicModule(FsCompany),
        './pages/about.tsx': dynamicModule(About),
      }),
    );

    const company = await requestRoute(router, '/company');
    expect((company?.['page:/company'] as ReactElement).type).toBe(Company);
    const about = await requestRoute(router, '/about');
    expect((about?.['page:/about'] as ReactElement).type).toBe(About);
    expect(await requestRoute(router, '/missing')).toBeNull();
  });

  it('builds each route from the router that serves it', async () => {
    vi.mocked(serializeRsc).mockClear();
    const BlogPost = () => createElement('p', null, 'blog post');
    const router = combineRouters(
      defineRouter({
        resolve: async (pathname) =>
          pathname.startsWith('/blog/')
            ? {
                elements: {
                  root: { render: () => 'root' },
                  route: { render: () => pathname },
                },
              }
            : null,
      }),
      createPages(async ({ createPage }) => [
        createPage({ path: '/company', render: 'static', component: Company }),
        createPage({
          path: '/blog/post',
          render: 'static',
          component: BlogPost,
        }),
      ]),
      fsRouter({
        './pages/company.tsx': async () => ({ default: FsCompany }),
        './pages/about.tsx': async () => ({ default: About }),
      }),
    );
    const utils = makeBuildUtils();

    await router.handleBuild(utils);

    const htmlFiles = utils.generateFile.mock.calls
      .map(([fileName]: unknown[]) => fileName)
      .filter((fileName) => String(fileName).endsWith('.html'));
    expect(htmlFiles.sort()).toEqual([
      '/about/index.html',
      '/company/index.html',
    ]);
    const serializedTypes = vi
      .mocked(serializeRsc)
      .mock.calls.map(([element]) => (element as ReactElement | null)?.type);
    expect(serializedTypes).toContain(Company);
    expect(serializedTypes).not.toContain(FsCompany);
    expect(serializedTypes).not.toContain(BlogPost);
  });

  it("restores each router's build metadata at runtime", async () => {
    const buildRouter = combineRouters(
      createPages(async ({ createPage }) => [
        createPage({ path: '/company', render: 'static', component: Company }),
      ]),
      fsRouter({ './pages/about.tsx': async () => ({ default: About }) }),
    );
    const buildUtils = makeBuildUtils();
    await buildRouter.handleBuild(buildUtils);
    const buildMetadata = new Map(buildUtils.saveBuildMetadata.mock.calls);

    // pruned static pages leave no runtime configs; they come back from metadata
    const runtimeRouter = combineRouters(
      createPages(async () => []),
      fsRouter({}),
    );
    const loadBuildMetadata = async (key: string) => buildMetadata.get(key);

    for (const path of ['/company', '/about']) {
      const elements = await requestRoute(
        runtimeRouter,
        path,
        makeUtils(loadBuildMetadata),
      );
      expect(elements?.ROUTE).toEqual([path, '']);
    }
  });

  it('renders the 404 route of a later router', async () => {
    const NotFound = () => createElement('p', null, 'not found');
    const router = combineRouters(
      createPages(async ({ createPage }) => [
        createPage({ path: '/company', render: 'dynamic', component: Company }),
      ]),
      fsRouter({ './pages/404.tsx': dynamicModule(NotFound) }),
    );
    const utils = makeUtils();

    await router.handleRequest(
      {
        type: 'http',
        pathname: '/missing',
        req: new Request('http://localhost/missing'),
      },
      utils,
    );

    expect(utils.renderRsc.mock.calls[0]![0].ROUTE).toEqual(['/404', '']);
    expect(utils.renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({ status: 404 }),
    );
  });

  it("wraps every request in every router's interceptors, in router order", async () => {
    const order: string[] = [];
    const orderingInterceptor =
      (name: string): HandlerInterceptor =>
      async (next) => {
        order.push(`${name}:before`);
        try {
          return await next();
        } finally {
          order.push(`${name}:after`);
        }
      };
    const router = combineRouters(
      createPages(async ({ createPage, createInterceptor }) => {
        createInterceptor(orderingInterceptor('a'));
        return [
          createPage({
            path: '/company',
            render: 'dynamic',
            component: Company,
          }),
        ];
      }),
      fsRouter({
        './pages/about.tsx': dynamicModule(About),
        './pages/_interceptors/b.ts': async () => ({
          default: orderingInterceptor('b'),
        }),
      }),
    );

    await requestRoute(router, '/about');

    expect(order).toEqual(['a:before', 'b:before', 'b:after', 'a:after']);
  });

  it('rejects handlers that defineRouter did not create', () => {
    const { handleRequest, handleBuild } = createPages(async () => []);
    expect(() => combineRouters({ handleRequest, handleBuild })).toThrow(
      'combineRouters accepts only routers created by defineRouter, createPages, or fsRouter',
    );
  });
});
