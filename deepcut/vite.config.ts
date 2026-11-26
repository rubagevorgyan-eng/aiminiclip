import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset paths: the built `dist/` works at a domain root (Vercel, Netlify)
// or inside a sub-folder of another static site (e.g. /games/deep-cut/) without changes.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
});
