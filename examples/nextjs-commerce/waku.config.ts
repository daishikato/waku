import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'waku/config';

const src = (name: string) =>
  fileURLToPath(new URL(`./src/${name}`, import.meta.url));

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // The app imports as `lib/shopify` and `components/cart/...`, which
      // Next.js resolves from tsconfig's baseUrl. Vite does not read baseUrl,
      // so the same two roots are declared here.
      alias: [
        { find: /^lib\//, replacement: src('lib/') },
        { find: /^components\//, replacement: src('components/') },
      ],
    },
  },
});
