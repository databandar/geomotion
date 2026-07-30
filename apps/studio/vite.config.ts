import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error — plain .mjs server middleware, no types needed
// Imported by package name, not a relative path across the app boundary: the
// dependency is declared in package.json where the boundary lint can see it.
import { studioServer, voiceStatic, assetStatic } from '@geomotion/pipeline/studio-server';

export default defineConfig(({ mode }) => {
  // Load .env.local into process.env for the middleware. Nothing is exposed to
  // the client: only VITE_-prefixed vars reach the bundle, and there are none.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [react(), studioServer(), voiceStatic(), assetStatic()],
    server: { port: 5173, open: true },
    build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  };
});
