import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Card, Tag } from 'antd';
import { NODE_TYPES } from '@/stores/editorStore';
import type { NodeType } from '@/stores/editorStore';

// 节点数据接口
interface NodeData {
  label: string;
  config: Record<string, unknown>;
}

// 自定义节点组件
const CustomNodeComponent: React.FC<NodeProps<NodeData>> = ({ data, selected, type }) => {
  const nodeType = NODE_TYPES.find(n => n.type === type as NodeType);
  const color = nodeType?.color || '#999';

  return (
    <Card
      size="small"
      style={{
        minWidth: 150,
        borderColor: selected ? color : '#d9d9d9',
        borderWidth: selected ? 2 : 1,
        boxShadow: selected ? `0 0 0 2px ${color}40` : 'none',
      }}
      styles={{ body: { padding: '8px 12px' } }}
    >
      {/* 输入连接点 */}
      <Handle
        type="target"
        position={Position.Top}
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
          <Tag
            style={{
              marginTop: 4,
              background: `${color}20`,
              borderColor: color,
              color: color,
              fontSize: 11,
            }}
          >
            {nodeType?.label}
          </Tag>
        </div>
      </div>

      {/* 输出连接点 */}
      <Handle
        type="source"
        position={Position.Bottom}
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

// 使用 memo 优化渲染
const CustomNode = memo(CustomNodeComponent);

// 节点类型映射
export const nodeTypes = {
  openUrl: CustomNode,
  click: CustomNode,
  type: CustomNode,
  waitFor: CustomNode,
  extract: CustomNode,
};
