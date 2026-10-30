import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import {
  STANDALONE_SETUP_TIMEOUT_MS,
  prepareStandaloneSetup,
  test,
} from './utils.js';

const startApp = prepareStandaloneSetup('custom-library-adapter');

test.describe('custom-library-adapter', () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  let standaloneDir: string;

  test.beforeAll(async () => {
    test.setTimeout(STANDALONE_SETUP_TIMEOUT_MS);
    ({ port, stopApp, standaloneDir } = await startApp('PRD', 'pnpm'));
  });

  test.afterAll(async () => {
    if (stopApp) {
      await stopApp();
    }
  });

  test('runs post build from dependency adapter', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('custom-adapter-heading')).toHaveText(
      'Hello from custom adapter',
    );

    const summaryPath = join(
      standaloneDir,
      'dist',
      'custom-adapter-post-build.json',
    );
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    expect(summary).toEqual({
      marker: 'custom-adapter-post-build',
    });
  });
});
