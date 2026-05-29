import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * Относительный base — корректные пути к JS/CSS на Netlify и при любом префиксе.
 * (Для деплоя только в подкаталог вида /saas-fit/ настройте base под хостинг отдельно.)
 */
export default defineConfig({
  /** Корень сайта (Netlify). Относительный base ломает /portal/:token — JS не грузится. */
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
