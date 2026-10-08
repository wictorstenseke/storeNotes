import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

// API_URL, ANON_KEY and SERVICE_ROLE_KEY come from the environment when set
// (to test a hosted project), otherwise from the running local stack.
function localSupabaseEnv(): Record<string, string> {
  if (process.env.API_URL) return {};
  const output = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const env: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    testTimeout: 20000,
    fileParallelism: false,
    env: localSupabaseEnv(),
  },
});
