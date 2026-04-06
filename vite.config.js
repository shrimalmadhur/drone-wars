import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: false,
  },
  test: {
    environment: 'node',
  },
});
