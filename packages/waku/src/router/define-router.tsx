import { unstable_createCustomError as createCustomError } from 'waku/minimal/server';
import type { Unstable_Handlers as Handlers } from 'waku/minimal/server';
import { createBuildHandler } from './define-router-utils/build-handler.js';
import type {
  BuildElementId,
  BuildPath,
} from './define-router-utils/build-handler.js';
import { createRequestHandler } from './define-router-utils/request-handler.js';
import {
  getRequest,
  getRerender,
  getRscParams,
  getRscPath,
  runWithRouterStore,
  setNonce,
} from './define-router-utils/request-store.js';
import type { HandlerInterceptor } from './define-router-utils/request-store.js';
import { createRouteEntries } from './define-router-utils/route-entries.js';
import type {
  Resolve,
  ResolveElement,
} from './define-router-utils/route-entries.js';
import type { NavigationHref } from './isomorphic-utils/build-route-href.js';
import { pathnameToRoutePath } from './isomorphic-utils/route-path.js';
import { encodeRoutePath } from './isomorphic-utils/router-protocol.js';

export { getRequest, getRscPath, getRscParams, setNonce };
export type { HandlerInterceptor };

const encodePathname = (pathname: string) => {
  if (!pathname.startsWith('/')) {
    throw new Error('Pathname must start with `/`: ' + pathname);
  }
  const url = new URL('http://localhost');
  url.pathname = pathname;
  return url.pathname;
};

/**
 * Renders the route the current server function was called from into its
 * response. The client drops it if the user has left that route by then.
 */
export function rerenderRoute(): void;
/**
 * Renders a route into the response of the current server function. `pathname`
 * is serialized as a URL pathname, so dot segments are resolved and unescaped
 * non-ASCII characters are percent-encoded. `query` is the search string
 * without `?`, serialized as URL search params, so `q=a b` becomes `q=a+b`.
 */
export function rerenderRoute(pathname: string, query?: string): void;
export function rerenderRoute(pathname?: string, query?: string) {
  if (pathname === undefined) {
    getRerender()();
    return;
  }
  const rscPath = encodeRoutePath(
    pathnameToRoutePath(encodePathname(pathname)),
  );
  const encodedQuery = new URLSearchParams(query).toString();
  getRerender()(
    rscPath,
    encodedQuery && new URLSearchParams({ query: encodedQuery }),
  );
}

export function notFound(): never {
  throw createCustomError('Not Found', { status: 404 });
}

/**
 * Redirect within the app, or away from it with an absolute http or https url.
 * Check destinations built from user input against your own allowlist.
 *
 * An absolute url navigates the document even when it names this origin, so
 * pass a path to stay within the app. A form submission without JavaScript is
 * followed by the browser, which resends the body on 307 and 308, so those
 * answer 303 instead.
 */
export function redirect(
  to: NavigationHref | `http://${string}` | `https://${string}` | URL,
  status: 303 | 307 | 308 = 307,
): never {
  let location = to instanceof URL ? to.href : to;
  const leavesTheApp =
    location.startsWith('http://') || location.startsWith('https://');
  if (
    leavesTheApp
      ? !URL.canParse(location)
      : !location.startsWith('/') || location.startsWith('//')
  ) {
    throw new Error(`Invalid redirect location: ${JSON.stringify(location)}`);
  }
  if (leavesTheApp) {
    // a redirect thrown mid stream reaches the client as this digest, before
    // anything resolves it
    const url = new URL(location);
    url.username = '';
    url.password = '';
    location = url.href;
  }
  for (let i = 0; i < location.length; ++i) {
    const charCode = location.charCodeAt(i);
    const isBackslash = charCode === 0x5c;
    if (
      charCode < 0x20 ||
      charCode === 0x7f ||
      (isBackslash && !leavesTheApp)
    ) {
      throw new Error(`Invalid redirect location: ${JSON.stringify(location)}`);
    }
  }
  throw createCustomError('Redirect', { status, location });
}

type RouterOptions = {
  resolve: Resolve;
  getBuildPaths?: () => Promise<Iterable<BuildPath>>;
  getBuildElementIds?: () => Promise<Iterable<BuildElementId>>;
  resolveElement?: ResolveElement;
  getHas404?: () => Promise<boolean>;
  unstable_interceptors?: HandlerInterceptor[];
  unstable_loadBuildMetadata?: (utils: {
    loadBuildMetadata: (key: string) => Promise<string | undefined>;
  }) => Promise<void>;
  unstable_saveBuildMetadata?: (utils: {
    saveBuildMetadata: (key: string, value: string) => Promise<void>;
    unstable_registerPrunableFile: (srcPath: string) => void;
  }) => Promise<void>;
};

const optionsByRouter = new WeakMap<Handlers, RouterOptions>();

/**
 * Creates server handlers for `waku/router/client`. `resolve` receives the
 * normalized pathname and query string without `?`, and returns a router
 * definition with `root` and `route` element sources, an HTTP handler, or
 * `null` for not found. The document root uses `Children_UNSTABLE` to place
 * the active route.
 *
 * `getBuildPaths` lists pathnames to resolve, or explicit
 * `{ pathname, routerDefinition }` targets. Immutable routes are prerendered,
 * HTTP handlers emit static responses, and mutable routes cache only immutable
 * elements. A target's `prerender: false` caches immutable sources without
 * emitting a page; `prefetchRegExp` is a regular expression matching paths
 * that share its client modules.
 * `resolveElement` handles `slice:<id>` requests from client `Slice`
 * components; `getBuildElementIds` lists immutable IDs to emit as standalone
 * RSC files, as strings to resolve or `{ id, source }` targets.
 * Only `slice:<id>` IDs are supported for standalone requests.
 * Unresolved or mutable build IDs fail the build.
 * An immutable source's optional `cacheKey` shares its cached content across
 * slot IDs. Without a key, route content is reused only from build-preloaded
 * entries. Custom 404 availability is checked once per router instance, using
 * `getHas404` when provided or resolving `/404` otherwise.
 * Immutable sources must render the same content for the lifetime of their ID
 * or explicit cache key. Use a bounded set of keys, not arbitrary request paths.
 *
 * `unstable_loadBuildMetadata` runs before each request and before the build,
 * so it can prepare what `resolve` reads. At runtime, `loadBuildMetadata`
 * reads the values `unstable_saveBuildMetadata` saved after the build; during
 * the build it reads `undefined`. `unstable_saveBuildMetadata` can also
 * register source files that only prerendered output uses, so the server
 * bundle can drop them.
 */
export function defineRouter(fns: RouterOptions): Handlers {
  const routeEntries = createRouteEntries(
    fns.resolve,
    fns.resolveElement,
    fns.getHas404,
  );
  const runHandled = async <T,>(
    req: Request,
    fn: () => Promise<T>,
  ): Promise<T> => {
    return runWithRouterStore(
      { req },
      (fns.unstable_interceptors ?? []).reduceRight(
        (next, interceptor) => () => interceptor(next),
        fn,
      ),
    );
  };
  const handleRequest = createRequestHandler({
    resolve: fns.resolve,
    routeEntries,
    runHandled,
  });
  const handleBuild = createBuildHandler({
    resolve: fns.resolve,
    getBuildPaths: fns.getBuildPaths,
    getBuildElementIds: fns.getBuildElementIds,
    routeEntries,
    runHandled,
  });
  const router: Handlers = {
    handleRequest: async (input, utils) => {
      await fns.unstable_loadBuildMetadata?.({
        loadBuildMetadata: utils.loadBuildMetadata,
      });
      return handleRequest(input, utils);
    },
    handleBuild: async (utils) => {
      await fns.unstable_loadBuildMetadata?.({
        loadBuildMetadata: async () => undefined,
      });
      await handleBuild(utils);
      await fns.unstable_saveBuildMetadata?.({
        saveBuildMetadata: utils.saveBuildMetadata,
        unstable_registerPrunableFile: utils.unstable_registerPrunableFile,
      });
    },
  };
  optionsByRouter.set(router, fns);
  return router;
}

const findResolved = async (
  optionsList: RouterOptions[],
  pathname: string,
  query: string,
) => {
  for (const options of optionsList) {
    const resolved = await options.resolve(pathname, query);
    if (resolved) {
      return resolved;
    }
  }
  return null;
};

const findElementSource = async (optionsList: RouterOptions[], id: string) => {
  for (const options of optionsList) {
    const source = await options.resolveElement?.(id);
    if (source) {
      return source;
    }
  }
  return null;
};

/**
 * Combines routers created by `unstable_defineRouter`, `createPages`, or
 * `fsRouter` into one router. A route or an independently requested element,
 * such as a slice, belongs to the first router that resolves it. The build
 * follows the same order and skips build paths and element IDs that an earlier
 * router resolves.
 *
 * The routers share element IDs, so an ID such as `root` or `layout:/` must
 * render the same content in every router that defines it. For example, give
 * `createPages` the root component that `fsRouter` reads from `_root.tsx`.
 * Handler interceptors from every router wrap every request, in router order.
 *
 * @example
 * export default adapter(
 *   unstable_combineRouters(
 *     createPages(async ({ createPage }) => [
 *       createPage({ path: '/company', render: 'static', component: Company }),
 *     ]),
 *     fsRouter(import.meta.glob('./pages/**\/*.{tsx,ts}')),
 *   ),
 * );
 */
export function combineRouters(...routers: Handlers[]): Handlers {
  const optionsList = routers.map((router) => {
    const options = optionsByRouter.get(router);
    if (!options) {
      throw new Error(
        'combineRouters accepts only routers created by defineRouter, createPages, or fsRouter',
      );
    }
    return options;
  });
  const getBuildMetadataKey = (index: number, key: string) =>
    `combineRouters:${index}:${key}`;
  return defineRouter({
    resolve: (pathname, query) => findResolved(optionsList, pathname, query),
    resolveElement: (id) => findElementSource(optionsList, id),
    getHas404: async () => {
      for (const options of optionsList) {
        const has404 = options.getHas404
          ? await options.getHas404()
          : await options
              .resolve('/404', '')
              .then(
                (result) => result !== null && typeof result !== 'function',
              );
        if (has404) {
          return true;
        }
      }
      return false;
    },
    getBuildPaths: async () => {
      const targets: BuildPath[] = [];
      for (const [index, options] of optionsList.entries()) {
        const earlierOptionsList = optionsList.slice(0, index);
        for (const target of (await options.getBuildPaths?.()) ?? []) {
          const url = new URL('http://localhost:3000');
          url.pathname = typeof target === 'string' ? target : target.pathname;
          url.pathname = pathnameToRoutePath(url.pathname);
          // resolve may call getRequest, as it can when the build resolves it
          const resolvedEarlier = await runWithRouterStore(
            { req: new Request(url) },
            () => findResolved(earlierOptionsList, url.pathname, ''),
          );
          if (!resolvedEarlier) {
            targets.push(target);
          }
        }
      }
      return targets;
    },
    getBuildElementIds: async () => {
      const targets: BuildElementId[] = [];
      for (const [index, options] of optionsList.entries()) {
        const earlierOptionsList = optionsList.slice(0, index);
        for (const target of (await options.getBuildElementIds?.()) ?? []) {
          const id = typeof target === 'string' ? target : target.id;
          if (!(await findElementSource(earlierOptionsList, id))) {
            targets.push(target);
          }
        }
      }
      return targets;
    },
    unstable_interceptors: [
      // read per request: createPages registers interceptors as it loads pages
      <T,>(next: () => Promise<T>) =>
        optionsList
          .flatMap((options) => options.unstable_interceptors ?? [])
          .reduceRight(
            (inner, interceptor) => () => interceptor(inner),
            next,
          )(),
    ],
    unstable_loadBuildMetadata: async ({ loadBuildMetadata }) => {
      await Promise.all(
        optionsList.map((options, index) =>
          options.unstable_loadBuildMetadata?.({
            loadBuildMetadata: (key) =>
              loadBuildMetadata(getBuildMetadataKey(index, key)),
          }),
        ),
      );
    },
    unstable_saveBuildMetadata: async ({
      saveBuildMetadata,
      unstable_registerPrunableFile,
    }) => {
      for (const [index, options] of optionsList.entries()) {
        await options.unstable_saveBuildMetadata?.({
          saveBuildMetadata: (key, value) =>
            saveBuildMetadata(getBuildMetadataKey(index, key), value),
          unstable_registerPrunableFile,
        });
      }
    },
  });
}
