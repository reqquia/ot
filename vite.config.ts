import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const BASE_PATH = process.env.BASE_PATH || '/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '.vercel/output/static',
    emptyOutDir: true,
  },
});

