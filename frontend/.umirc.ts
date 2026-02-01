import { defineConfig } from 'umi';

export default defineConfig({
  plugins: ['@umijs/plugins/dist/antd'],
  antd: {},
  // 启用 mock
  mock: {},
  // 代理配置（开发时转发到真实后端）
  proxy: {
    '/api': {
      target: 'http://localhost:8080',
      changeOrigin: true,
    },
  },
});
