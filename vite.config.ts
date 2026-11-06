import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build also works from a GitHub Pages sub-path.
  base: './',
  server: {
    // host: true lets a phone on the same Wi-Fi open the dev server.
    host: true,
    port: 5173,
    // Source art is processed by scripts in tools/; watching it only risks
    // Windows file-lock crashes (EBUSY) while those scripts read it.
    watch: { ignored: ['**/art-source/**', '**/tools/**'] },
  },
  build: { target: 'es2019', outDir: 'dist' },
});
