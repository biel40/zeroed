import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';

export async function runCloudflareTest(root) {
  process.env.WRANGLER_LOG_PATH ??= join(root, '.wrangler', 'test-logs');
  process.env.WRANGLER_SEND_METRICS = 'false';
  const { createTestHarness } = await import('wrangler');
  const harness = createTestHarness({ root, workers: [{ configPath: 'wrangler.jsonc' }] });

  try {
    let url;
    try {
      ({ url } = await harness.listen());
    } catch (error) {
      throw new Error('Could not start the local Cloudflare Worker for relay tests.', { cause: error });
    }

    const relayUrl = new URL('/multiplayer', url);
    relayUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const child = spawn(process.execPath, ['--test', 'cloudflare/multiplayer.test.mjs'], {
      cwd: root,
      env: { ...process.env, COOP_TEST_URL: relayUrl.href },
      stdio: 'inherit',
    });
    const [exitCode] = await once(child, 'exit');
    return exitCode ?? 1;
  } finally {
    await harness.close();
  }
}
