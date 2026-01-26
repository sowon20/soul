import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,  // WebSocket 프록시 활성화
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
