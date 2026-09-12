import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const readRsdwClientDevBundle = () => {
  const pkgJsonPath = require.resolve('react-server-dom-webpack/package.json');
  const bundlePath = join(
    dirname(pkgJsonPath),
    'cjs',
    'react-server-dom-webpack-client.browser.development.js',
  );
  return readFileSync(bundlePath, 'utf8').replace(/\s+/g, ' ');
};

// facebook/react#37116. React 19.2 did not read back debug info that
// moveDebugInfoFromChunkToInnerValue had moved from a chunk onto its resolved
// value, so those chunks went missing from the Server Components performance
// track and Waku patched the recovery in. React recovers it itself since 19.3
// and the patch is gone; fail loudly if that ever regresses.
describe('react-server-dom-webpack debug info recovery', () => {
  it('is in the installed react-server-dom-webpack client dev bundle', () => {
    const code = readRsdwClientDevBundle();
    expect(code).toContain('flushComponentPerformance');
    expect(code).toContain(
      'debugInfo = root._debugInfo; if (0 === debugInfo.length && "fulfilled" === root.status)',
    );
    expect(code).toContain('resolveLazy(root.value)');
    expect(code).toContain('isArrayImpl(resolvedValue._debugInfo)');
  });
});
