import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.ts', 'api/test/**/*.test.ts', 'worker/test/**/*.test.ts'],
    environment: 'node',
  },
});
