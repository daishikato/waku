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
  unstable_initialize?: (buildMetadata: string | undefined) => Promise<void>;
  unstable_getBuildMetadata?: () => Promise<string>;
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
 * `unstable_initialize` runs once, before the first request or the build. It
 * receives the string `unstable_getBuildMetadata` returned in the build, or
 * `undefined` during the build and in development. After the build,
 * `unstable_getPrunableFiles` lists source files that only prerendered output
 * uses, so the server bundle can drop them.
 */
export function defineRouter(fns: RouterOptions): Handlers & {
  unstable_routerOptions: RouterOptions;
} {
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
  let initialized: Promise<void> | undefined;
  const initialize = (loadBuildMetadata: () => Promise<string | undefined>) =>
    (initialized ??= (async () => {
      await fns.unstable_initialize?.(await loadBuildMetadata());
    })().catch((error: unknown) => {
      initialized = undefined;
      throw error;
    }));
  return {
    handleRequest: async (input, utils) => {
      await initialize(() =>
        utils.loadBuildMetadata(ROUTER_METADATA.buildMetadata),
      );
      return handleRequest(input, utils);
    },
    handleBuild: async (utils) => {
      await initialize(async () => undefined);
      await handleBuild(utils);
      for (const file of (await fns.unstable_getPrunableFiles?.()) ?? []) {
        utils.unstable_registerPrunableFile(file);
      }
      if (fns.unstable_getBuildMetadata) {
        await utils.saveBuildMetadata(
          ROUTER_METADATA.buildMetadata,
          await fns.unstable_getBuildMetadata(),
        );
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
        (target) => (typeof target === 'string' ? target : target.pathname),
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
    unstable_initialize: async (buildMetadata) => {
      const buildMetadataList: (string | null)[] = buildMetadata
        ? JSON.parse(buildMetadata)
        : [];
      await Promise.all(
        optionsList.map((options, index) =>
          options.unstable_initialize?.(buildMetadataList[index] ?? undefined),
        ),
      );
    },
    unstable_getBuildMetadata: async () =>
      JSON.stringify(
        await Promise.all(
          optionsList.map((options) => options.unstable_getBuildMetadata?.()),
        ),
      ),
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
