import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2020', assetsInlineLimit: 0 },
  server: { host: true },
  preview: { host: true },
});
