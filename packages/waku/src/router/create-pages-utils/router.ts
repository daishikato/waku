// Import the public API directly; the server barrel would cycle through createPages.
import { defineRouter } from '../define-router.js';
import {
  pathSpecAsString,
  pathSpecToRegExpSource,
} from '../isomorphic-utils/path-spec.js';
import { getSliceSlotId } from '../isomorphic-utils/router-protocol.js';
import { createConfigRegistry } from './config-registry.js';
import type { HandlerInterceptor, RuntimeConfig } from './config.js';
import { createRouteResolver } from './route-resolver.js';

export const createConfiguredRouter = (fns: {
  getConfigs: () => Promise<Iterable<RuntimeConfig>>;
  unstable_skipBuild?: (routePath: string) => boolean;
  unstable_interceptors?: HandlerInterceptor[];
}) => {
  const registry = createConfigRegistry(fns.getConfigs);
  const resolver = createRouteResolver(registry);
  const router = defineRouter({
    resolve: resolver.resolve,
    resolveElement: resolver.resolveElement,
    getHas404: async () => registry.has404(),
    getBuildPaths: async () => {
      const targets = [];
      for (const config of registry.getAll()) {
        if (config.type === 'slice') {
          continue;
        }
        const isLiteral = config.pathSpec.every(
          (part) => part.type === 'literal',
        );
        const pathname = pathSpecAsString(config.pathSpec);
        if (isLiteral && fns.unstable_skipBuild?.(pathname)) {
          continue;
        }
        if (config.type === 'api') {
          if (isLiteral && config.isStatic) {
            targets.push({
              pathname,
              routerDefinition: (req: Request) =>
                config.handler(req, { params: {} }),
            });
          }
          continue;
        }
        targets.push({
          pathname,
          routerDefinition: await resolver.resolveRoute(config, pathname, ''),
          prerender: isLiteral && config.isStatic,
          prefetchRegExp: pathSpecToRegExpSource(
            config.pathPatternSpec ?? config.pathSpec,
          ),
        });
      }
      return targets;
    },
    getBuildElementIds: async () =>
      Promise.all(
        registry.getAll().flatMap((config) => {
          if (config.type !== 'slice' || !config.isStatic || config.pathSpec) {
            return [];
          }
          const id = getSliceSlotId(config.id);
          return [
            resolver
              .resolveElement(id, { sliceConfig: config })
              .then((source) => ({ id, source: source! })),
          ];
        }),
      ),
    ...(fns.unstable_interceptors && {
      unstable_interceptors: fns.unstable_interceptors,
    }),
    unstable_initialize: registry.initialize,
    unstable_getPrunableFiles: async () => {
      // pruned modules are served from the build output, which covers only
      // routes whose sources are all static
      const isStaticBySourceFile = new Map<string, boolean>();
      const record = (sourceFile: string | undefined, isStatic: boolean) => {
        if (sourceFile) {
          isStaticBySourceFile.set(
            sourceFile,
            isStatic && (isStaticBySourceFile.get(sourceFile) ?? true),
          );
        }
      };
      for (const config of registry.getAll()) {
        if (config.type === 'route') {
          record(config.rootElement.sourceFile, config.isStatic);
          for (const element of Object.values(config.elements)) {
            record(element.sourceFile, config.isStatic);
          }
          for (const id of config.slices ?? []) {
            const sourceFile =
              registry.findSliceConfig(id)?.sliceConfig.sourceFile;
            record(sourceFile, config.isStatic);
          }
        } else {
          record(config.sourceFile, config.isStatic);
        }
      }
      return Array.from(isStaticBySourceFile)
        .filter(([, isStatic]) => isStatic)
        .map(([file]) => file);
    },
  });
  return {
    ...router,
    unstable_getRouterConfigs: async () => registry.getAll(),
  };
};
