import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Button, Card, Space, Tag } from 'antd';
import { observer } from 'mobx-react-lite';
import { EditOutlined } from '@ant-design/icons';
import { NODE_DEFINITIONS } from '@/models/stepRegistry';
import type { NodeType } from '@/stores/editorStore';
import { runStore } from '@/stores/runStore';
import { editorStore } from '@/stores/editorStore';

// 节点数据接口
interface NodeData {
  label: string;
  config: Record<string, unknown>;
}

type BranchType = 'then' | 'else' | 'body';

const getNodeState = (id: string) => {
  const currentPath = runStore.currentStepPath || [];
  const stepStatus = runStore.getStepStatus(id);
  const nestedStatus = runStore.getPathAggregateStatus([id]);
  const pathActive = currentPath.includes(id);
  const paused = runStore.isDebugPaused && pathActive;

  return {
    stepStatus: stepStatus || (nestedStatus ? { stepId: id, status: nestedStatus } : undefined),
    nestedStatus,
    pathActive,
    paused,
  };
};

const getNodeBorder = (selected: boolean, color: string, status?: string, pathActive?: boolean) => {
  if (status === 'failed') return '#dc2626';
  if (status === 'succeeded') return '#16a34a';
  if (status === 'running' || pathActive) return color;
  return selected ? color : '#d9d9d9';
};

const SubflowPreview: React.FC<{
  nodeId: string;
  branch: BranchType;
  color: string;
  count: number;
  previewLabels: string[];
  active: boolean;
  status?: 'pending' | 'running' | 'succeeded' | 'failed';
  onEdit: (event: React.MouseEvent<HTMLElement>) => void;
}> = ({ nodeId, branch, color, count, previewLabels, active, status, onEdit }) => {
  const accent = branch === 'then' ? '#0891b2' : branch === 'else' ? '#2563eb' : '#7c3aed';
  const background = `${accent}12`;
  const labels = previewLabels.slice(0, 3);
  const statusColor = status === 'failed' ? 'error' : status === 'running' ? 'processing' : status === 'succeeded' ? 'success' : undefined;
  const statusText = status === 'failed' ? '失败' : status === 'running' ? '执行中' : status === 'succeeded' ? '成功' : null;

  return (
    <div
      data-testid={`subflow-preview-${nodeId}-${branch}`}
      style={{
        border: `1px solid ${accent}33`,
        background,
        borderRadius: 10,
        padding: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space wrap size={6}>
          <Tag color={branch === 'then' ? 'cyan' : branch === 'else' ? 'geekblue' : 'purple'}>
            {branch.toUpperCase()} {count}
          </Tag>
          {statusText && (
            <Tag data-testid={`subflow-status-${nodeId}-${branch}`} color={statusColor}>
              {statusText}
            </Tag>
          )}
          <span style={{ fontSize: 11, color: '#666' }}>mini-canvas</span>
        </Space>
        <Button
          size="small"
          type={active ? 'primary' : 'default'}
          icon={<EditOutlined />}
          onClick={onEdit}
        >
          编辑 {branch.toUpperCase()}
        </Button>
      </div>

      <div
        style={{
          minHeight: 58,
          borderRadius: 8,
          border: `1px dashed ${color}44`,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248,250,252,0.92))',
          padding: '8px 10px',
          display: 'grid',
          gap: 6,
        }}
      >
        {labels.length > 0 ? labels.map((label, index) => (
          <div key={`${branch}-${label}-${index}`} style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
            <div
              data-testid={`subflow-preview-node-${nodeId}-${branch}-${index}`}
              style={{
                minWidth: 92,
                maxWidth: '100%',
                padding: '4px 8px',
                borderRadius: 999,
                background: '#fff',
                border: `1px solid ${accent}55`,
                boxShadow: `0 4px 12px ${accent}14`,
                fontSize: 11,
                color: '#1f2937',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
            {index < labels.length - 1 && (
              <div style={{ width: 1, height: 10, background: `${accent}55` }} />
            )}
          </div>
        )) : (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 42, fontSize: 11, color: '#94a3b8' }}>
            暂无子步骤，拖拽节点后会在这里显示缩略预览
          </div>
        )}
      </div>
    </div>
  );
};

// 自定义节点组件
const CustomNodeComponent: React.FC<NodeProps<NodeData>> = ({ id, data, selected, type }) => {
  const nodeType = NODE_DEFINITIONS.find(n => n.type === type as NodeType);
  const color = nodeType?.color || '#999';
  const { stepStatus, pathActive, paused } = getNodeState(id);
  const borderColor = getNodeBorder(selected, color, stepStatus?.status, pathActive);
  const hasBreakpoint = data.config?.breakpoint === true;

  return (
    <Card
      size="small"
      className={selected ? 'editor-flow-node editor-flow-node--selected' : 'editor-flow-node'}
      style={{
        minWidth: 150,
        borderColor,
        borderWidth: 2,
        boxShadow: paused
          ? '0 0 0 3px rgba(245, 158, 11, 0.45)'
          : selected || stepStatus?.status === 'running' || pathActive
            ? `0 0 0 2px ${color}40`
            : 'none',
      }}
      styles={{ body: { padding: '8px 12px' } }}
    >
      {/* 输入连接点 */}
      <Handle
        type="target"
        position={Position.Left}
        data-testid={`${id}-target-handle`}
        data-handle-position="left"
        style={{
          width: 10,
          height: 10,
          background: color,
          border: '2px solid #fff',
        }}
      />

      {/* 节点内容 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{nodeType?.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{data.label}</div>
          <Space wrap size={4} style={{ marginTop: 4 }}>
            <Tag
              style={{
                background: `${color}20`,
                borderColor: color,
                color: color,
                fontSize: 11,
              }}
            >
              {nodeType?.label}
            </Tag>
            {hasBreakpoint && <Tag color="gold" data-testid={`breakpoint-badge-${id}`}>断点</Tag>}
            {paused && <Tag color="orange">已暂停</Tag>}
          </Space>
        </div>
      </div>

      {/* 输出连接点 */}
      <Handle
        type="source"
        position={Position.Right}
        data-testid={`${id}-source-handle`}
        data-handle-position="right"
        style={{
          width: 10,
          height: 10,
          background: color,
          border: '2px solid #fff',
        }}
      />
    </Card>
  );
};

const ContainerNodeComponent: React.FC<NodeProps<NodeData>> = ({ id, data, selected, type }) => {
  const nodeType = NODE_DEFINITIONS.find(n => n.type === type as NodeType);
  const color = nodeType?.color || '#999';
  const { stepStatus, nestedStatus, pathActive, paused } = getNodeState(id);
  const borderColor = getNodeBorder(selected, color, stepStatus?.status, pathActive);
  const hasBreakpoint = data.config?.breakpoint === true;
  const thenCount = editorStore.getSubflowCount(id, 'then');
  const elseCount = editorStore.getSubflowCount(id, 'else');
  const bodyCount = editorStore.getSubflowCount(id, 'body');
  const thenPreview = editorStore.getSubflowPreviewLabels(id, 'then');
  const elsePreview = editorStore.getSubflowPreviewLabels(id, 'else');
  const bodyPreview = editorStore.getSubflowPreviewLabels(id, 'body');
  const isActive = editorStore.activeSubflow?.nodeId === id;
  const thenStatus = runStore.getPathAggregateStatus([id, 'then']);
  const elseStatus = runStore.getPathAggregateStatus([id, 'else']);
  const bodyStatus = runStore.getPathAggregateStatus([id, 'body']);

  return (
    <Card
      size="small"
      className={selected ? 'editor-flow-node editor-flow-node--selected' : 'editor-flow-node'}
      style={{
        minWidth: 240,
        borderColor: borderColor,
        borderWidth: 2,
        boxShadow: paused
          ? '0 0 0 3px rgba(245, 158, 11, 0.45)'
          : selected || stepStatus?.status === 'running' || pathActive
            ? `0 0 0 2px ${color}40`
            : 'none',
      }}
      styles={{ body: { padding: '10px 12px' } }}
    >
      <Handle
        type="target"
        position={Position.Left}
        data-testid={`${id}-target-handle`}
        data-handle-position="left"
        style={{ width: 10, height: 10, background: color, border: '2px solid #fff' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{nodeType?.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{data.label}</div>
          <Space wrap size={4} style={{ marginTop: 4 }}>
            <Tag style={{ background: `${color}20`, borderColor: color, color, fontSize: 11 }}>
              {nodeType?.label}
            </Tag>
            {hasBreakpoint && <Tag color="gold" data-testid={`breakpoint-badge-${id}`}>断点</Tag>}
            {paused && <Tag color="orange">已暂停</Tag>}
          </Space>
          {nestedStatus === 'failed' && (
            <Tag data-testid={`container-status-${id}`} color="error" style={{ marginTop: 4 }}>
              子流程失败
            </Tag>
          )}
        </div>
      </div>

      <div style={{ border: `1px dashed ${color}55`, borderRadius: 8, minHeight: 72, padding: 8, background: '#fafafa', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>subflow 预览</div>
        {type === 'if' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <SubflowPreview
              nodeId={id}
              branch="then"
              color={color}
              count={thenCount}
              previewLabels={thenPreview}
              active={isActive && editorStore.activeSubflow?.branch === 'then'}
              status={thenStatus}
              onEdit={(event) => {
                event.stopPropagation();
                editorStore.enterSubflow(id, 'then');
              }}
            />
            <SubflowPreview
              nodeId={id}
              branch="else"
              color={color}
              count={elseCount}
              previewLabels={elsePreview}
              active={isActive && editorStore.activeSubflow?.branch === 'else'}
              status={elseStatus}
              onEdit={(event) => {
                event.stopPropagation();
                editorStore.enterSubflow(id, 'else');
              }}
            />
          </div>
        ) : (
          <SubflowPreview
            nodeId={id}
            branch="body"
            color={color}
            count={bodyCount}
            previewLabels={bodyPreview}
            active={isActive}
            status={bodyStatus}
            onEdit={(event) => {
              event.stopPropagation();
              editorStore.enterSubflow(id, 'body');
            }}
          />
        )}
        <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
          {isActive ? '当前正在编辑此节点的子流程，右侧配置会同步当前作用域' : '节点内先显示缩略 subflow，点击按钮可进入完整子流程画布'}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        data-testid={`${id}-source-handle`}
        data-handle-position="right"
        style={{ width: 10, height: 10, background: color, border: '2px solid #fff' }}
      />
    </Card>
  );
};

// 使用 memo 优化渲染
const CustomNode = memo(observer(CustomNodeComponent));
const ContainerNode = memo(observer(ContainerNodeComponent));

// 节点类型映射
export const nodeTypes = {
  openUrl: CustomNode,
  click: CustomNode,
  type: CustomNode,
  waitFor: CustomNode,
  extract: CustomNode,
  newPage: CustomNode,
  closePage: CustomNode,
  switchPage: CustomNode,
  reloadPage: CustomNode,
  screenshotPage: CustomNode,
  hover: CustomNode,
  focus: CustomNode,
  selectOption: CustomNode,
  scrollPage: CustomNode,
  uploadFiles: CustomNode,
  executeJs: CustomNode,
  waitForResponse: CustomNode,
  getUrl: CustomNode,
  downloadFile: CustomNode,
  importText: CustomNode,
  totp: CustomNode,
  getCookies: CustomNode,
  clearCookies: CustomNode,
  if: ContainerNode,
  forTimes: ContainerNode,
  forEachElement: ContainerNode,
  forEachData: ContainerNode,
  startBrowser: ContainerNode,
  closeBrowser: CustomNode,
  while: ContainerNode,
  break: CustomNode,
  callWorkflow: CustomNode,
  convertJson: CustomNode,
  extractKey: CustomNode,
  randomGet: CustomNode,
};
