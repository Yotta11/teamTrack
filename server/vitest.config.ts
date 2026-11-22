import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/db/seed.ts', 'src/db/migrate.ts', 'src/db/create-admin.ts'],
      reporter: ['text-summary', 'html', 'lcov'],
      thresholds: { lines: 70, statements: 70 },
    },
  },
});
