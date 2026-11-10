import { defineConfig } from 'vite';

// base './' so the build works both on GitHub Pages (any repo name) and from a local folder.
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
});
