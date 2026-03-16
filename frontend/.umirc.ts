import { defineConfig } from 'umi';

const useMock = process.env.UMI_APP_USE_MOCK === 'true';

export default defineConfig({
  plugins: ['@umijs/plugins/dist/antd'],
  antd: {},
  esbuildMinifyIIFE: true,
  // 启用 mock
  mock: useMock ? {} : false,
  // 代理配置（开发时转发到真实后端）
  proxy: {
    '/api': {
      target: 'http://localhost:8080',
      changeOrigin: true,
    },
    '/ws': {
      target: 'http://localhost:8080',
      changeOrigin: true,
      ws: true,
    },
  },
});
