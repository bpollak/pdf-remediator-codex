import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'stores/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        lines: 55,
        functions: 55,
        branches: 45
      }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url))
    }
  }
});
