import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Must match the port `npm run dev:api` starts wrangler on. */
const WORKER_PORT = 8788;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    /*
     * The auth API lives in the Worker, not in Vite. Without this proxy every
     * /api/* call from the dev server 404s with an empty body, which surfaces
     * in the UI as the generic "Something went wrong" — the API is simply not
     * there. `npm run dev` starts both processes so this target is live.
     */
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${WORKER_PORT}`,
        changeOrigin: false,
      },
    },
  },
});
