import { unstable_createCustomError as createCustomError } from 'waku/minimal/server';
import type { Unstable_Handlers as Handlers } from 'waku/minimal/server';
import { createBuildHandler } from './define-router-utils/build-handler.js';
import type {
  BuildElementId,
  BuildPath,
} from './define-router-utils/build-handler.js';
import { ROUTER_METADATA } from './define-router-utils/build-metadata.js';
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
  RouterDefinition,
  StaticRouterDefinition,
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

const throwNotBuilt = (id: string): never => {
  throw new Error(
    `defineRouter: ${id} is not in the build output; rebuild required`,
  );
};

type RouterOptions = {
  resolve: Resolve;
  getBuildPaths?: () => Promise<Iterable<BuildPath>>;
  getBuildElementIds?: () => Promise<Iterable<BuildElementId>>;
  resolveElement?: ResolveElement;
  getHas404?: () => Promise<boolean>;
  unstable_interceptors?: HandlerInterceptor[];
  unstable_initialize?: () => Promise<void>;
  unstable_getPrunableFiles?: () => Promise<Iterable<string>>;
};

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
 * A route whose sources are all immutable, or a built element ID, is kept in
 * the build output: at runtime it is served from there when the router no
 * longer resolves it, so its modules can be dropped from the server bundle.
 * After the build, `unstable_getPrunableFiles` lists those source files.
 * `unstable_initialize` runs once, before the first request or the build.
 */
export function defineRouter(fns: RouterOptions): Handlers & {
  unstable_routerOptions: RouterOptions;
} {
  let staticRouterDefinitionByRoutePath = new Map<
    string,
    StaticRouterDefinition
  >();
  let staticElementIds = new Set<string>();
  const resolve: Resolve = async (pathname, query) => {
    const resolved = await fns.resolve(pathname, query);
    const staticRouterDefinition =
      staticRouterDefinitionByRoutePath.get(pathname);
    if (resolved || !staticRouterDefinition) {
      return resolved;
    }
    const elements: Record<string, RouterDefinition['elements']['root']> = {};
    for (const [id, source] of Object.entries(
      staticRouterDefinition.elements,
    )) {
      elements[id] = {
        ...source,
        immutable: true,
        render: () => throwNotBuilt(id),
      };
    }
    return {
      elements: elements as RouterDefinition['elements'],
      ...(staticRouterDefinition.noSsr && { noSsr: true }),
    };
  };
  const resolveElement: ResolveElement = async (id) =>
    (await fns.resolveElement?.(id)) ??
    (staticElementIds.has(id)
      ? { immutable: true, render: () => throwNotBuilt(id) }
      : null);
  const { getHas404 } = fns;
  const routeEntries = createRouteEntries(
    resolve,
    resolveElement,
    getHas404 &&
      (async () =>
        staticRouterDefinitionByRoutePath.has('/404') || getHas404()),
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
    resolve,
    routeEntries,
    runHandled,
  });
  const handleBuild = createBuildHandler({
    resolve,
    getBuildPaths: fns.getBuildPaths,
    getBuildElementIds: fns.getBuildElementIds,
    routeEntries,
    runHandled,
  });
  let initialized: Promise<void> | undefined;
  const initialize = (
    loadBuildMetadata: (key: string) => Promise<string | undefined>,
  ) =>
    (initialized ??= (async () => {
      staticRouterDefinitionByRoutePath = new Map(
        Object.entries(
          JSON.parse(
            (await loadBuildMetadata(
              ROUTER_METADATA.staticRouterDefinitions,
            )) || '{}',
          ),
        ),
      );
      staticElementIds = new Set(
        JSON.parse(
          (await loadBuildMetadata(ROUTER_METADATA.staticElementIds)) || '[]',
        ),
      );
      await fns.unstable_initialize?.();
    })().catch((error: unknown) => {
      initialized = undefined;
      throw error;
    }));
  return {
    handleRequest: async (input, utils) => {
      await initialize(utils.loadBuildMetadata);
      return handleRequest(input, utils);
    },
    handleBuild: async (utils) => {
      await initialize(async () => undefined);
      await handleBuild(utils);
      for (const file of (await fns.unstable_getPrunableFiles?.()) ?? []) {
        utils.unstable_registerPrunableFile(file);
      }
    },
    unstable_routerOptions: fns,
  };
}

// the build writes each target to a file, so a later router would overwrite
// what an earlier router emitted
const joinBuildTargets = <Target,>(
  targetsList: Iterable<Target>[],
  getKey: (target: Target) => string,
) => {
  const routerIndexByKey = new Map<string, number>();
  return targetsList.flatMap((targets, index) =>
    Array.from(targets, (target) => {
      const key = getKey(target);
      if ((routerIndexByKey.get(key) ?? index) !== index) {
        throw new Error('combineRouters: more than one router builds ' + key);
      }
      routerIndexByKey.set(key, index);
      return target;
    }),
  );
};

/**
 * Combines routers created by `unstable_defineRouter`, `createPages`, or
 * `fsRouter` into one router. A route or an independently requested element,
 * such as a slice, belongs to the first router that resolves it. The build
 * fails when two routers list the same build path or element ID.
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
export function combineRouters(
  ...routers: ReturnType<typeof defineRouter>[]
): ReturnType<typeof defineRouter> {
  const optionsList = routers.map((router) => router.unstable_routerOptions);
  return defineRouter({
    resolve: async (pathname, query) => {
      for (const options of optionsList) {
        const resolved = await options.resolve(pathname, query);
        if (resolved) {
          return resolved;
        }
      }
      return null;
    },
    resolveElement: async (id) => {
      for (const options of optionsList) {
        const source = await options.resolveElement?.(id);
        if (source) {
          return source;
        }
      }
      return null;
    },
    getBuildPaths: async () =>
      joinBuildTargets(
        await Promise.all(
          optionsList.map((options) => options.getBuildPaths?.() ?? []),
        ),
        (target) => {
          const url = new URL('http://localhost:3000');
          url.pathname = typeof target === 'string' ? target : target.pathname;
          return pathnameToRoutePath(url.pathname);
        },
      ),
    getBuildElementIds: async () =>
      joinBuildTargets(
        await Promise.all(
          optionsList.map((options) => options.getBuildElementIds?.() ?? []),
        ),
        (target) => (typeof target === 'string' ? target : target.id),
      ),
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
    unstable_initialize: async () => {
      await Promise.all(
        optionsList.map((options) => options.unstable_initialize?.()),
      );
    },
    unstable_getPrunableFiles: async () => {
      const filesList = await Promise.all(
        optionsList.map(
          (options) => options.unstable_getPrunableFiles?.() ?? [],
        ),
      );
      return filesList.flatMap((files) => [...files]);
    },
  });
}
