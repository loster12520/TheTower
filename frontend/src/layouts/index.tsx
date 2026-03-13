import React, { useEffect } from 'react';
import { Layout, Badge, Tooltip, Space, Button } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, LoadingOutlined, BulbOutlined } from '@ant-design/icons';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'umi';
import { healthStore } from '@/stores/healthStore';
import { uiStore } from '@/stores/uiStore';
import './index.scss';

const { Header, Content, Footer } = Layout;

const GlobalLayout: React.FC = observer(() => {
  // 组件挂载时启动健康检查
  useEffect(() => {
    healthStore.startPeriodicCheck(10000);
    return () => {
      healthStore.stopPeriodicCheck();
    };
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', uiStore.theme);
    }
  }, [uiStore.theme]);

  const renderStatusIcon = () => {
    if (healthStore.isChecking && healthStore.status === 'unknown') {
      return <LoadingOutlined style={{ color: healthStore.statusColor }} />;
    }
    if (healthStore.status === 'healthy') {
      return <CheckCircleOutlined style={{ color: healthStore.statusColor }} />;
    }
    return <ExclamationCircleOutlined style={{ color: healthStore.statusColor }} />;
  };

  return (
    <Layout className="tt-layout">
      <Header className="tt-layout-header">
        <div className="tt-layout-brand">
          <h1 className="tt-layout-title">TheTower</h1>
          <span className="tt-layout-subtitle">
            浏览器 RPA 工作流系统
          </span>
        </div>

        <div className="tt-layout-right">
          <Button
            icon={<BulbOutlined />}
            onClick={() => uiStore.toggleTheme()}
            size="small"
          >
            {uiStore.theme === 'light' ? '暗色' : '亮色'}
          </Button>

          <Tooltip title={healthStore.lastError || healthStore.statusText}>
            <Space className="tt-layout-status">
              <span>后端状态:</span>
              <Badge dot={healthStore.isChecking}>
                {renderStatusIcon()}
              </Badge>
              <span style={{ color: healthStore.statusColor }}>
                {healthStore.statusText}
              </span>
            </Space>
          </Tooltip>
        </div>
      </Header>
      
      <Content className="tt-layout-content">
        {/* 使用 Outlet 渲染子路由页面内容 */}
        <Outlet />
      </Content>
      
      <Footer className="tt-layout-footer">
        TheTower ©2026 浏览器 RPA 画布工作流系统 v0.0.1
      </Footer>
    </Layout>
  );
});

export default GlobalLayout;
