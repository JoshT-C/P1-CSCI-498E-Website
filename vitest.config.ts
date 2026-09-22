import { defineConfig } from 'vitest/config';
import angular from '@angular/build/vite';

export default defineConfig({
  plugins: [angular()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.ts']
  }
});
