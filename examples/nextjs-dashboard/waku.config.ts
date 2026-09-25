import { fileURLToPath } from 'node:url';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // PGlite loads a WASM image (pglite.data) next to its own module, so it has
    // to stay out of the server bundle and be imported from node_modules at
    // runtime. Any dependency with runtime assets (sharp, better-sqlite3, a
    // Prisma client) needs the same treatment.
    environments: {
      rsc: { resolve: { external: ['@electric-sql/pglite'] } },
      ssr: { resolve: { external: ['@electric-sql/pglite'] } },
    },
  },
});
