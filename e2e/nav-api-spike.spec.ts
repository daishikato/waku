import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('nav-api-spike');

const ALLOWED_IMPORT_PREFIXES = [
  'react',
  'waku/minimal/client',
  'waku/router/core',
];

test.describe('nav-api-spike imports', () => {
  test('binding imports stay on the L1 surface', () => {
    const bindingPath = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/nav-binding.tsx', import.meta.url),
    );
    const src = readFileSync(bindingPath, 'utf8');
    expect(src).not.toMatch(/client\.tsx|router-state|client-utils|core-utils/);
    const specs = [...src.matchAll(/from ['"]([^'"]+)['"]/g)].map(
      (match) => match[1]!,
    );
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(
        ALLOWED_IMPORT_PREFIXES.some((prefix) => spec.includes(prefix)),
        spec,
      ).toBe(true);
    }
  });
});

test.describe('nav-api-spike', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('initial render', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('home')).toHaveText('Home');
  });

  test('anchor navigation goes through the navigate event', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-hello').click();
    await expect(page.getByTestId('hello')).toHaveText('Hello spike');
    await expect(page).toHaveURL(/\/hello\/spike$/);
  });

  test('a missing route follows the 404 page', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-missing').click();
    await expect(page.getByTestId('not-found')).toHaveText('Custom 404');
  });

  test('useParams and useSearch work under the spike binding', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/hello/spike`);
    await waitForHydration(page);
    await expect(page.getByTestId('params')).toHaveText('spike');
    await page.getByTestId('go-search').click();
    await expect(page.getByTestId('search')).toHaveText('hi');
  });

  test('a lazy Slice renders', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-slice').click();
    await expect(page.getByTestId('slice-clock')).toHaveText('lazy clock');
  });
});
