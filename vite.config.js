import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // Fail loudly rather than silently moving to another port — the backend's
    // CORS_ORIGIN is pinned to 5173, so a surprise port would look like a CORS bug.
    strictPort: true
  },
  preview: {
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
