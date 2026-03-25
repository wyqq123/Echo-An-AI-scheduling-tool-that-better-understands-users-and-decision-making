import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // --- 新增 proxy 代理配置 ---
        proxy: {
          '/api': {
            target: 'http://localhost:3001', // 你的 Express 服务器地址
            changeOrigin: true,
            // 如果后端接口不是以 /api 开头，可以使用 rewrite 重写路径，目前不需要
          }
        }
        // ------------------------
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});