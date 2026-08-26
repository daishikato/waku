import { describe, expect, it } from 'vitest';
import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import type { RouterHost } from '../src/router/client-utils/host.js';

describe('RouterHost contract', () => {
  it('keys are exactly route and navigate', () => {
    type HostKeys = keyof RouterHost;
    expectType<TypeEqual<HostKeys, 'route' | 'navigate'>>(true);

    const host: RouterHost = {
      route: { path: '/', query: '', hash: '' },
      navigate: async () => {},
    };
    expect(Reflect.ownKeys(host)).toEqual(['route', 'navigate']);
  });
});
