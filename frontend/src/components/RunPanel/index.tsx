import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  Alert,
  Card,
  Button,
  List,
  Tag,
  Space,
  Typography,
  Empty,
  Badge,
  message,
  Descriptions,
  Modal,
  Collapse,
} from 'antd';
import { CloseOutlined, SyncOutlined, FullscreenOutlined, DesktopOutlined, LinkOutlined, StopOutlined, CaretRightOutlined, StepForwardOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { runStore } from '@/stores/runStore';
import { editorStore } from '@/stores/editorStore';

const { Text, Title } = Typography;

const runPanelCardStyle = { marginBottom: 16 } as const;
const runPanelScrollableCardStyles = { body: { maxHeight: 220, overflow: 'auto' as const } };
const runPanelLogBodyStyles = { body: { maxHeight: 300, overflow: 'auto' as const, background: '#1e1e1e', padding: 8 } };

interface RunPanelProps {
  onClose: () => void;
}

const RunPanel: React.FC<RunPanelProps> = observer(({ onClose }) => {
  const { currentRun, logs, events, stepStatusMap, latestOutputs, latestArtifacts } = runStore;
  const latestFailedStepPath = runStore.latestFailedStepPath;
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const debugVariables = runStore.latestDebugContext?.variables || {};
  const debugStatus = runStore.debugSession?.status;
  const currentStepDisplayName = runStore.currentStepDisplayName || (runStore.currentStepId ? `步骤 ${runStore.currentStepId.slice(-8)}` : '-');

  const debugStatusTagColor = (() => {
    switch (debugStatus) {
      case 'PAUSED':
        return 'warning';
      case 'COMPLETED_WAITING_CLOSE':
        return 'success';
      case 'FAILED_WAITING_CLOSE':
      case 'ERROR':
        return 'error';
      default:
        return 'processing';
    }
  })();

  const handleContinueDebug = async () => {
    const success = await runStore.continueDebug();
    if (success) {
      message.success('调试运行已继续');
    } else if (runStore.error) {
      message.error(runStore.error);
    }
  };

  const handleStepDebug = async () => {
    const success = await runStore.stepDebug();
    if (success) {
      message.success('已发送单步执行');
    } else if (runStore.error) {
      message.error(runStore.error);
    }
  };

  const handleOpenDebugBrowser = async () => {
    const success = await runStore.openDebugBrowser();
    if (success) {
      message.success('已打开或切换到宿主机浏览器调试窗口');
    } else if (runStore.error) {
      message.error(runStore.error);
    }
  };

  const handleCloseDebug = async () => {
    const success = await runStore.closeDebug();
    if (success) {
      message.success('调试预览已关闭');
      setPreviewOpen(false);
    } else if (runStore.error) {
      message.error(runStore.error);
    }
  };

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

  const technicalDetailItems = [
    {
      key: 'technical-details',
      label: (
        <Space size={8}>
          <Text strong>技术详情</Text>
          <Text type="secondary">变量、产物、步骤、日志与事件流</Text>
        </Space>
      ),
      children: (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="变量检查器" size="small">
            {runStore.latestDebugContext ? (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Descriptions column={1} size="small" styles={{ label: { width: 110 } }}>
                  <Descriptions.Item label="当前步骤">
                    {runStore.latestDebugContext.stepId || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="当前路径">
                    {runStore.latestDebugContext.stepPath.join(' / ') || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="页面别名">
                    {runStore.latestDebugContext.pageAlias || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="上下文">
                    {runStore.latestDebugContext.contextId || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="更新时间">
                    {runStore.latestDebugContext.updatedAt ? new Date(runStore.latestDebugContext.updatedAt).toLocaleString() : '-'}
                  </Descriptions.Item>
                </Descriptions>
                {Object.keys(debugVariables).length > 0 ? (
                  <Collapse
                    size="small"
                    items={Object.entries(debugVariables).map(([key, value]) => ({
                      key,
                      label: key,
                      children: <Text copyable={{ text: value }} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</Text>,
                    }))}
                  />
                ) : (
                  <Empty description="当前暂停点暂无变量快照" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Space>
            ) : (
              <Empty description="尚未收到调试上下文" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          <Card title="产物摘要" size="small">
            {latestArtifacts.length > 0 ? (
              <List
                size="small"
                dataSource={latestArtifacts}
                renderItem={(artifact) => (
                  <List.Item>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Space>
                        <Tag color="purple">{artifact.kind}</Tag>
                        <Text strong>{artifact.name}</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>{artifact.relativePath}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无运行产物" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          <Card title="步骤执行" size="small" styles={runPanelScrollableCardStyles}>
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

          <Card title="运行日志" size="small" styles={runPanelLogBodyStyles}>
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

          <Card title="事件流" size="small" styles={runPanelScrollableCardStyles}>
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
                          if (stepPath) {
                            return stepPath;
                          }

                          if (payload.outputs && typeof payload.outputs === 'object') {
                            return `outputs: ${Object.keys(payload.outputs as Record<string, unknown>).join(', ')}`;
                          }

                          if (Array.isArray(payload.artifacts) && payload.artifacts.length > 0) {
                            return `artifacts: ${(payload.artifacts as Array<{ name?: string }>).map((item) => item.name).join(', ')}`;
                          }

                          return JSON.stringify(payload).slice(0, 100);
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
        </Space>
      ),
    },
  ];

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
        <Card size="small" style={runPanelCardStyle}>
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
              <Text>{currentStepDisplayName}</Text>
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

      {runStore.debugSession?.enabled && (
        <>
          <Card
            title="调试预览"
            size="small"
            style={runPanelCardStyle}
            extra={
              <Space>
                <Tag color={debugStatusTagColor}>
                  {runStore.debugStatusText}
                </Tag>
                <Button
                  size="small"
                  icon={<FullscreenOutlined />}
                  onClick={() => setPreviewOpen(true)}
                  disabled={!runStore.debugPreviewUrl}
                >
                  全屏
                </Button>
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Descriptions column={1} size="small" styles={{ label: { width: 96 } }}>
                <Descriptions.Item label="页面别名">
                  {runStore.debugSession.pageAlias || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="上下文">
                  {runStore.debugSession.contextId || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="最近帧">
                  {runStore.debugSession.lastFrameTs ? new Date(runStore.debugSession.lastFrameTs).toLocaleTimeString() : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="启动即暂停">
                  {runStore.debugSession.pauseOnStart ? '是' : '否'}
                </Descriptions.Item>
                <Descriptions.Item label="结束后保留">
                  {runStore.debugSession.keepBrowserOnFinish ? '是' : '否'}
                </Descriptions.Item>
                <Descriptions.Item label="当前步骤">
                  {runStore.currentStepDisplayName || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="宿主机调试">
                  <Space wrap>
                    <Tag color={runStore.debugSession.openVisibleBrowser ? 'blue' : 'default'}>可见浏览器</Tag>
                    <Tag color={runStore.debugSession.openDevtools ? 'gold' : 'default'}>DevTools</Tag>
                    {runStore.debugSession.openVisibleBrowser || runStore.debugSession.openDevtools ? (
                      <Text type="secondary">启动调试运行时已请求打开</Text>
                    ) : null}
                  </Space>
                </Descriptions.Item>
              </Descriptions>

              {runStore.debugSession.lastError ? (
                <Text type="danger">{runStore.debugSession.lastError}</Text>
              ) : null}

              {(debugStatus === 'COMPLETED_WAITING_CLOSE' || debugStatus === 'FAILED_WAITING_CLOSE') ? (
                <Alert
                  type={debugStatus === 'COMPLETED_WAITING_CLOSE' ? 'success' : 'error'}
                  showIcon
                  message={debugStatus === 'COMPLETED_WAITING_CLOSE' ? '运行已结束，浏览器现场仍保留。' : '运行失败，但浏览器现场仍保留。'}
                  description="可继续查看页面状态，确认完成后再关闭调试预览。"
                />
              ) : null}

              <Space wrap>
                <Button size="small" icon={<LinkOutlined />} onClick={handleOpenDebugBrowser}>
                  打开浏览器调试
                </Button>
                <Button
                  size="small"
                  type="primary"
                  icon={<CaretRightOutlined />}
                  onClick={handleContinueDebug}
                  disabled={!runStore.isDebugPaused}
                >
                  继续
                </Button>
                <Button
                  size="small"
                  icon={<StepForwardOutlined />}
                  onClick={handleStepDebug}
                  disabled={!runStore.isDebugPaused}
                >
                  单步
                </Button>
                <Button size="small" danger icon={<StopOutlined />} onClick={handleCloseDebug}>
                  关闭调试预览
                </Button>
              </Space>

              {runStore.isDebugPaused ? (
                <Alert
                  type="warning"
                  showIcon
                  icon={<PauseCircleOutlined />}
                  message={`调试已暂停${runStore.lastDebugReason ? `：${runStore.lastDebugReason}` : ''}`}
                  action={
                    <Button
                      size="small"
                      type="link"
                      onClick={() => {
                        const stepPath = runStore.currentStepPath;
                        if (stepPath?.length) {
                          editorStore.focusStepPath(stepPath);
                        }
                      }}
                    >
                      定位当前节点
                    </Button>
                  }
                />
              ) : null}

              {runStore.debugPreviewUrl ? (
                <div
                  style={{
                    borderRadius: 14,
                    overflow: 'hidden',
                    border: '1px solid #dbe3f0',
                    background: 'linear-gradient(180deg, #07111f, #0f172a)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(15, 23, 42, 0.88)' }}>
                    <Space>
                      <Badge status="processing" />
                      <Text style={{ color: '#e5eefc' }}>近实时浏览器预览</Text>
                    </Space>
                    <Space size={6}>
                      <DesktopOutlined style={{ color: '#93c5fd' }} />
                      <Text style={{ color: '#93c5fd', fontSize: 12 }}>
                        {runStore.latestDebugFrame?.width || 0} x {runStore.latestDebugFrame?.height || 0}
                      </Text>
                    </Space>
                  </div>
                  <img
                    src={runStore.debugPreviewUrl}
                    alt="调试预览"
                    style={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'contain', background: '#020617' }}
                  />
                </div>
              ) : (
                <Empty description="调试运行已启动，等待预览帧..." image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Space>
          </Card>

          <Modal
            open={previewOpen}
            footer={null}
            onCancel={() => setPreviewOpen(false)}
            width="92vw"
            style={{ top: 20 }}
            title="调试预览全屏"
            destroyOnHidden
          >
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="运行状态">{currentRun?.status || '-'}</Descriptions.Item>
                <Descriptions.Item label="调试状态">{runStore.debugSession.status}</Descriptions.Item>
                <Descriptions.Item label="当前步骤">{runStore.currentStepDisplayName || '-'}</Descriptions.Item>
                <Descriptions.Item label="结束后保留">{runStore.debugSession.keepBrowserOnFinish ? '是' : '否'}</Descriptions.Item>
                <Descriptions.Item label="页面别名">{runStore.debugSession.pageAlias || '-'}</Descriptions.Item>
                <Descriptions.Item label="上下文">{runStore.debugSession.contextId || '-'}</Descriptions.Item>
                <Descriptions.Item label="当前路径" span={2}>{runStore.currentStepPath?.join(' / ') || '-'}</Descriptions.Item>
              </Descriptions>
              {runStore.debugPreviewUrl ? (
                <img
                  src={runStore.debugPreviewUrl}
                  alt="调试预览全屏"
                  style={{ display: 'block', width: '100%', maxHeight: '74vh', objectFit: 'contain', background: '#020617', borderRadius: 16 }}
                />
              ) : (
                <Empty description="暂无预览帧" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </Space>
          </Modal>
        </>
      )}

      <Card title="输出摘要" size="small" style={runPanelCardStyle}>
        {Object.keys(latestOutputs).length > 0 ? (
          <Descriptions column={1} size="small" styles={{ label: { width: 96 } }}>
            {Object.entries(latestOutputs).map(([key, value]) => (
              <Descriptions.Item key={key} label={key}>
                <Text copyable={{ text: value }}>{value}</Text>
              </Descriptions.Item>
            ))}
          </Descriptions>
        ) : (
          <Empty description="暂无输出变量" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      <Collapse
        size="small"
        style={runPanelCardStyle}
        data-testid="runpanel-technical-details"
        items={technicalDetailItems}
      />
    </div>
  );
});

export default RunPanel;
