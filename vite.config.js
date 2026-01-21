import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        background: resolve(__dirname, 'src/background/service-worker.js'),
        'content-scripts/google-meet': resolve(__dirname, 'src/content-scripts/google-meet.js'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background/service-worker.js';
          }
          if (chunkInfo.name.includes('content-scripts')) {
            return '[name].js';
          }
          return '[name]/[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return '[name]/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
      },
    },
    target: 'esnext',
    minify: false,
  },
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    {
      name: 'copy-manifest-and-assets',
      closeBundle() {
        // Ensure directories exist
        const dirs = ['dist', 'dist/icons', 'dist/popup', 'dist/background', 'dist/offscreen', 'dist/content-scripts'];
        dirs.forEach(dir => {
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
        });

        // Copy manifest.json
        copyFileSync('public/manifest.json', 'dist/manifest.json');

        // Copy icons
        ['icon16.png', 'icon48.png', 'icon128.png'].forEach(icon => {
          const src = `public/icons/${icon}`;
          if (existsSync(src)) {
            copyFileSync(src, `dist/icons/${icon}`);
          }
        });

        // Copy HTML files to correct locations (Vite puts them in dist/src/...)
        const htmlMoves = [
          { from: 'dist/src/popup/popup.html', to: 'dist/popup/popup.html' },
          { from: 'dist/src/offscreen/offscreen.html', to: 'dist/offscreen/offscreen.html' },
        ];

        htmlMoves.forEach(({ from, to }) => {
          if (existsSync(from)) {
            copyFileSync(from, to);
          }
        });
      },
    },
  ],
});
