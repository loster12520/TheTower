import React, { useEffect } from 'react';
import { Layout, Badge, Tooltip, Space } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'umi';
import { healthStore } from '@/stores/healthStore';

const { Header, Content, Footer } = Layout;

const GlobalLayout: React.FC = observer(() => {
  // 组件挂载时启动健康检查
  useEffect(() => {
    healthStore.startPeriodicCheck(10000);
    return () => {
      healthStore.stopPeriodicCheck();
    };
  }, []);

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
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        backgroundColor: '#001529',
        padding: '0 24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1 style={{ 
            color: '#fff', 
            margin: 0, 
            fontSize: '20px',
            fontWeight: 600
          }}>
            TheTower
          </h1>
          <span style={{ 
            color: 'rgba(255,255,255,0.45)', 
            marginLeft: '12px',
            fontSize: '14px'
          }}>
            浏览器 RPA 工作流系统
          </span>
        </div>
        
        <Tooltip title={healthStore.lastError || healthStore.statusText}>
          <Space style={{ color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
            <span>后端状态:</span>
            <Badge dot={healthStore.isChecking}>
              {renderStatusIcon()}
            </Badge>
            <span style={{ color: healthStore.statusColor }}>
              {healthStore.statusText}
            </span>
          </Space>
        </Tooltip>
      </Header>
      
      <Content style={{ padding: '24px', backgroundColor: '#f0f2f5' }}>
        {/* 使用 Outlet 渲染子路由页面内容 */}
        <Outlet />
      </Content>
      
      <Footer style={{ textAlign: 'center', backgroundColor: '#f0f2f5' }}>
        TheTower ©2026 浏览器 RPA 画布工作流系统 v0.0.1
      </Footer>
    </Layout>
  );
});

export default GlobalLayout;
