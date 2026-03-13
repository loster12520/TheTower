import React from 'react';
import '@/styles/theme.scss';

// 运行时配置 - rootContainer 用于包裹整个应用
export function rootContainer(container: React.ReactNode) {
  return <>{container}</>;
}
