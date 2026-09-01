import { fileURLToPath } from 'node:url';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        // Next.js reads the `paths` mapping out of tsconfig.json; Vite does not,
        // so the `@/*` alias the app already uses is declared here as well.
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
