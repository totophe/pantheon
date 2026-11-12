import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on its own port; in production Caddy proxies /api (see Caddyfile).
const api = process.env.PANTHEON_API ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': api } },
  preview: { proxy: { '/api': api } },
});
