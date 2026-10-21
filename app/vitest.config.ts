import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Same mapping as metro.config.js: the app uses ride-core's TypeScript source directly.
      '@wayfarian/ride-core': path.resolve(__dirname, '../packages/ride-core/src/index.ts'),
    },
  },
  test: {
    include: ['v2/**/*.test.ts'],
    environment: 'node',
  },
});
