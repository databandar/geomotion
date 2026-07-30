import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * A plain static app. There is no dev-server middleware and no API: the editor
 * talks to tile providers and nothing else, which is what lets `pnpm build` produce
 * a directory you can host anywhere.
 *
 * The AI Studio used to mount an LLM/voice/render API here, which also meant an
 * OpenRouter key in .env.local. Both are gone.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
