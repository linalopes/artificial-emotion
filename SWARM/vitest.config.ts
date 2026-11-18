import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.ts', 'coordinator/test/**/*.test.ts', 'web/src/**/*.test.ts'],
    testTimeout: 20000
  }
});

