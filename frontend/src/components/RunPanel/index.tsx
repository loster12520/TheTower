import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  Card,
  Button,
  List,
  Tag,
  Space,
  Typography,
  Empty,
  Badge,
  Divider,
  message,
} from 'antd';
import { CloseOutlined, SyncOutlined } from '@ant-design/icons';
import { runStore } from '@/stores/runStore';
import { editorStore } from '@/stores/editorStore';

const { Text, Title } = Typography;

interface RunPanelProps {
  onClose: () => void;
}

const RunPanel: React.FC<RunPanelProps> = observer(({ onClose }) => {
  const { currentRun, logs, events, stepStatusMap } = runStore;
  const latestFailedStepPath = runStore.latestFailedStepPath;

  // 获取运行状态标签
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return <Badge status="processing" text="运行中" />;
      case 'SUCCEEDED':
        return <Badge status="success" text="成功" />;
      case 'FAILED':
        return <Badge status="error" text="失败" />;
      case 'CANCELED':
        return <Badge status="warning" text="已取消" />;
      default:
        return <Badge status="default" text={status} />;
    }
  };

  // 获取步骤状态标签
  const getStepStatusTag = (stepId: string) => {
    const status = stepStatusMap.get(stepId);
    if (!status) return <Tag>待执行</Tag>;

    switch (status.status) {
      case 'running':
        return <Tag color="processing" icon={<SyncOutlined spin />}>执行中</Tag>;
      case 'succeeded':
        return <Tag color="success">成功</Tag>;
      case 'failed':
        return <Tag color="error">失败</Tag>;
      default:
        return <Tag>待执行</Tag>;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>运行监控</Title>
        <Button 
          type="text" 
          size="small" 
          icon={<CloseOutlined />} 
          onClick={onClose}
        />
      </div>

      {/* 运行状态 */}
      {currentRun && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text type="secondary">运行ID: </Text>
              <Text copyable code>{currentRun.id.slice(-8)}</Text>
            </div>
            <div>
              <Text type="secondary">状态: </Text>
              {getStatusBadge(currentRun.status)}
            </div>
            <div>
              <Text type="secondary">当前步骤: </Text>
              <Text>{runStore.currentStepId ? runStore.currentStepId.slice(-8) : '-'}</Text>
            </div>
            <div>
              <Text type="secondary">当前路径: </Text>
              <Text>{runStore.currentStepPath?.join(' / ') || '-'}</Text>
            </div>
            {latestFailedStepPath && (
              <Button
                block
                danger
                data-testid="locate-failed-step"
                onClick={() => {
                  const located = editorStore.focusStepPath(latestFailedStepPath);
                  if (!located) {
                    message.warning(editorStore.error || '失败节点定位失败');
                  }
                }}
              >
                定位失败节点
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* 步骤执行状态 */}
      <Card 
        title="步骤执行" 
        size="small" 
        style={{ marginBottom: 16 }}
        styles={{ body: { maxHeight: 200, overflow: 'auto' } }}
      >
        {editorStore.nodes.length > 0 ? (
          <List
            size="small"
            dataSource={editorStore.nodes}
            renderItem={(node) => (
              <List.Item>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <Space>
                    <Text>{node.data.label as string}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {node.id.slice(-6)}
                    </Text>
                  </Space>
                  {getStepStatusTag(node.id)}
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无步骤" />
        )}
      </Card>

      {/* 日志 */}
      <Card 
        title="运行日志" 
        size="small"
        styles={{ body: { maxHeight: 300, overflow: 'auto', background: '#1e1e1e', padding: 8 } }}
      >
        {logs.length > 0 ? (
          <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {logs.map((log, index) => (
              <div key={index} style={{ marginBottom: 4 }}>
                <Text style={{ color: '#888', fontSize: 11 }}>
                  {new Date(log.ts).toLocaleTimeString()}
                </Text>
                {' '}
                <Tag 
                  size="small" 
                  color={log.level === 'ERROR' ? 'red' : log.level === 'WARN' ? 'orange' : 'green'}
                  style={{ fontSize: 10, padding: '0 4px' }}
                >
                  {log.level}
                </Tag>
                {' '}
                <Text style={{ color: '#fff' }}>{log.message}</Text>
              </div>
            ))}
          </div>
        ) : (
          <Empty description="暂无日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      {/* 事件流 */}
      <Divider style={{ margin: '16px 0' }} />
      <Card 
        title="事件流" 
        size="small"
        styles={{ body: { maxHeight: 200, overflow: 'auto' } }}
      >
        {events.length > 0 ? (
          <List
            size="small"
            dataSource={events.slice().reverse()}
            renderItem={(event) => (
              <List.Item>
                <Space direction="vertical" style={{ width: '100%' }} size={0}>
                  <Space>
                    <Tag color="blue" style={{ fontSize: 11 }}>{event.type}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      #{event.seq}
                    </Text>
                  </Space>
                  <Text style={{ fontSize: 12 }}>
                    {(() => {
                      const payload = event.payload || {};
                      const stepPath = Array.isArray(payload.stepPath)
                        ? (payload.stepPath as string[]).join(' / ')
                        : null;
                      return stepPath || JSON.stringify(payload).slice(0, 100);
                    })()}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>
    </div>
  );
});

export default RunPanel;
