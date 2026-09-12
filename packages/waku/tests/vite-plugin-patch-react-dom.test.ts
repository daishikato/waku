import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { patchReactDomPlugin } from '../src/lib/vite-plugins/patch-react-dom.js';

const require = createRequire(import.meta.url);

const readInstalledClient = (mode: string) => {
  const packagePath = require.resolve('react-dom/package.json');
  const id = join(dirname(packagePath), 'cjs', `react-dom-client.${mode}.js`);
  return { id, code: readFileSync(id, 'utf8') };
};

const runTransform = async (code: string, id: string) => {
  const plugin = patchReactDomPlugin();
  if (typeof plugin.transform !== 'function') {
    throw new Error('Plugin transform is not defined');
  }
  return plugin.transform.call({} as never, code, id);
};

test('patches the optimized React DOM client', async () => {
  const output = await runTransform(
    '(hoistableRoot = resource.state.preload) && check();',
    '/tmp/react-dom_client.js?v=123',
  );
  expect(output).toContain(
    '(hoistableRoot = resource.state.preload) && hoistableRoot.isConnected &&',
  );
});

test.each(['development', 'production'])(
  'patches the installed React DOM %s client',
  async (mode) => {
    const { id, code } = readInstalledClient(mode);
    const output = await runTransform(code, id);
    expect(output).toContain(
      '(hoistableRoot = resource.state.preload) && hoistableRoot.isConnected &&',
    );
  },
);

// wakujs/waku#2288. React 19.2 dropped a ping that arrived while the root was
// rendering, so Waku patched the recovery in. React records the pinged lanes
// itself since 19.3 and the patch is gone; fail loudly if that ever regresses.
test.each(['development', 'production'])(
  'installed React DOM %s client records a ping that arrives during a render',
  (mode) => {
    const { code } = readInstalledClient(mode);
    const normalized = code.replace(/\s+/g, ' ');
    expect(normalized).toContain(
      '? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)',
    );
    expect(normalized).not.toMatch(/&& prepareFreshStack\(root, 0\)/);
  },
);

test('skips unrelated files', async () => {
  const output = await runTransform(
    '(hoistableRoot = resource.state.preload) && check();',
    '/tmp/unrelated.js',
  );
  expect(output).toBeUndefined();
});
