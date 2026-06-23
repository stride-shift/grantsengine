import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

export default defineConfig(({ mode }) => {
  // Read the backend PORT straight from .env so the proxy always targets the
  // actual Express port (defaults to 3001, matching .env.example) and never
  // drifts when PORT is overridden.
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.PORT || '3001';

  return {
  plugins: [react()],
  // `@` → /src so imports stay depth-independent across the components/ domain folders.
  // Vitest reads this same config, so the alias resolves in dev, build, and tests.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Dev server on 3000 (matches the CORS default in server/app.js); API proxied
    // to the Express backend on whatever PORT .env specifies.
    port: 3000,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  };
});
