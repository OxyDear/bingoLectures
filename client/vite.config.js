import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '');
  const port = env.API_PORT || env.PORT || 3000;
  return {
    plugins: [react()],
    server: { port: 5173, proxy: { '/api': `http://127.0.0.1:${port}` } }
  };
});