import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2020', assetsInlineLimit: 0 },
  server: { host: true, port },
  preview: { host: true, port },
});
