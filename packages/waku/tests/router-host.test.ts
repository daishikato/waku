import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, expect, it } from 'vitest';
import type { RouterHost } from '../src/router/client-core-utils/host.js';

describe('RouterHost contract', () => {
  it('keys are exactly route and navigate', () => {
    type HostKeys = keyof RouterHost;
    expectType<TypeEqual<HostKeys, 'route' | 'navigate'>>(true);
  });

  it('states that navigate resolves on supersession and rejects on failure', () => {
    const src = readFileSync(
      fileURLToPath(
        new URL('../src/router/client-core-utils/host.ts', import.meta.url),
      ),
      'utf8',
    );
    expect(src).toMatch(/newer navigation supersedes it/);
    expect(src).toMatch(/Rejects when the navigation fails/);
  });
});
