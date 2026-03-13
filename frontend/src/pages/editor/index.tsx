import React, { useEffect, useCallback, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Connection,
  Edge,
  Node,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Card,
  Button,
  Space,
  Tooltip,
  message,
  Spin,
  Alert,
  Modal,
  Divider,
  Flex,
  Badge,
} from 'antd';
import {
  SaveOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { history, useSearchParams } from 'umi';
import { editorStore, NODE_TYPES } from '@/stores/editorStore';
import { runStore } from '@/stores/runStore';
import { nodeTypes } from '@/nodes';
import NodeConfigPanel from '@/components/NodeConfigPanel';
import RunPanel from '@/components/RunPanel';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import { appLogger, buildWsUrl } from '@/config/runtime';
import { validateCanvas } from '@/utils/validator';
import type { NodeType } from '@/stores/editorStore';
import type { RunEvent } from '@/stores/runStore';
import './index.scss';

// 画布编辑区域
const FlowEditorInner: React.FC = observer(() => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project } = useReactFlow();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    setNodes(editorStore.nodes);
  }, [editorStore.nodes, setNodes]);

  useEffect(() => {
    setEdges(editorStore.edges);
  }, [editorStore.edges, setEdges]);

  const handleNodesChange = useCallback((changes: any[]) => {
    onNodesChange(changes);
    changes.forEach(change => {
      if (change.type === 'position' && change.position) {
        editorStore.updateNodePosition(change.id, change.position);
      }
    });
  }, [onNodesChange]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    editorStore.setSelectedNode(node);
  }, []);

  const handlePaneClick = useCallback(() => {
    editorStore.setSelectedNode(null);
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    const success = editorStore.addEdge(connection);
    if (success) {
      setEdges(eds => addEdge({ ...connection, type: 'smoothstep' }, eds));
    } else {
      message.warning(editorStore.error || '无法连接节点');
    }
  }, [setEdges]);

  const handleEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
    edgesToDelete.forEach(edge => editorStore.deleteEdge(edge.id));
  }, []);

  const handleNodesDelete = useCallback((nodesToDelete: Node[]) => {
    nodesToDelete.forEach(node => editorStore.deleteNode(node.id));
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow') as NodeType;
    if (!type || !reactFlowWrapper.current) return;

    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = project({
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    });

    editorStore.addNode(type, position);
  }, [project]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div ref={reactFlowWrapper} className="editor-flow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onEdgesDelete={handleEdgesDelete}
        onNodesDelete={handleNodesDelete}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={['Delete', 'Backspace']}
        className="editor-flow"
      >
        <Background gap={16} size={1} color="#e9ecef" />
        <Controls />
        <MiniMap 
          nodeStrokeWidth={3} 
          zoomable 
          pannable 
          className="editor-flow-minimap"
        />
      </ReactFlow>
    </div>
  );
});

// 用 Provider 包裹
const FlowEditor: React.FC = () => (
  <ReactFlowProvider>
    <FlowEditorInner />
  </ReactFlowProvider>
);

// 节点库
const NodeLibrary: React.FC = () => {
  const onDragStart = (event: React.DragEvent, type: NodeType) => {
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Card 
      title="节点库" 
      size="small" 
      className="editor-node-library"
      styles={{ body: { padding: 12 } }}
    >
      <Flex vertical gap="small">
        {NODE_TYPES.map((nodeType) => (
          <div
            key={nodeType.type}
            draggable
            onDragStart={(e) => onDragStart(e, nodeType.type)}
            className="editor-node-library__item"
            style={{ '--node-color': nodeType.color } as React.CSSProperties}
          >
            <span className="editor-node-library__icon">{nodeType.icon}</span>
            <span className="editor-node-library__label">{nodeType.label}</span>
          </div>
        ))}
      </Flex>
      <Divider className="editor-node-library__divider" />
      <div className="editor-node-library__hint">拖拽节点到画布中添加</div>
    </Card>
  );
};

// 主页面
const EditorPage: React.FC = observer(() => {
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('id');
  const [runPanelVisible, setRunPanelVisible] = React.useState(false);

  // 页面关闭前提示
  useBeforeUnload(editorStore.isDirty);

  // WebSocket 连接
  const wsUrl = runStore.wsUrl ? buildWsUrl(runStore.wsUrl) : null;
  const { disconnect } = useWebSocket(wsUrl, {
    key: runStore.currentRun?.id || runStore.wsUrl || 'editor-run',
    onMessage: (data: RunEvent) => {
      runStore.handleEvent(data);
    },
    onClose: () => {
      appLogger.info('[Editor] WebSocket closed');
    },
  });

  // 加载模板数据
  useEffect(() => {
    if (templateId) {
      editorStore.loadTemplate(templateId);
    }
  }, [templateId]);

  // 保存
  const handleSave = async () => {
    const success = await editorStore.saveTemplate();
    if (success) {
      message.success('保存成功');
    } else if (editorStore.error) {
      message.error(editorStore.error);
    }
  };

  // 运行前校验
  const handleRun = async () => {
    if (!templateId) return;

    // 先保存
    if (editorStore.isDirty) {
      const saved = await editorStore.saveTemplate();
      if (!saved) {
        message.error('保存失败，无法启动运行');
        return;
      }
    }

    // 运行前校验
    const validation = editorStore.validateForRun();

    if (!validation.valid) {
      Modal.error({
        title: '配置有误，无法运行',
        content: (
          <div>
            {validation.errors.map((err, i) => (
              <div key={i}>• {err}</div>
            ))}
          </div>
        ),
      });
      return;
    }

    if (validation.warnings.length > 0) {
      Modal.warning({
        title: '警告',
        content: validation.warnings[0],
        onOk: () => startRun(),
      });
    } else {
      startRun();
    }
  };

  const startRun = async () => {
    if (!templateId) return;
    
    const success = await runStore.startRun(templateId);
    if (success) {
      setRunPanelVisible(true);
      message.success('运行已启动');
    } else if (runStore.error) {
      message.error(runStore.error);
    }
  };

  // 取消运行
  const handleCancelRun = async () => {
    await runStore.cancelRun();
    disconnect();
  };

  // 返回
  const handleBack = () => {
    if (editorStore.isDirty) {
      Modal.confirm({
        title: '未保存的更改',
        content: '您有未保存的更改，确定要离开吗？',
        onOk: () => history.push('/'),
      });
    } else {
      history.push('/');
    }
  };

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="editor-page">
      {/* 顶部工具栏 */}
      <div className="editor-toolbar">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            返回
          </Button>
          <span className="editor-toolbar__title">
            {editorStore.templateName || '未命名模板'}
            {editorStore.isDirty && <span className="editor-toolbar__dirty"> *</span>}
          </span>
        </Space>

        <Space>
          {runStore.isRunning ? (
            <Button
              danger
              icon={<StopOutlined />}
              loading={runStore.isLoading}
              onClick={handleCancelRun}
            >
              停止
            </Button>
          ) : (
            <Tooltip title="保存 (Ctrl+S)">
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={editorStore.saving}
                onClick={handleSave}
              >
                保存
              </Button>
            </Tooltip>
          )}
          
          {!runStore.isRunning && (
            <Button 
              icon={<PlayCircleOutlined />} 
              type="primary" 
              ghost
              onClick={handleRun}
              disabled={editorStore.nodes.length === 0}
            >
              运行
            </Button>
          )}

          {runStore.isRunning && (
            <Badge status="processing" text="运行中" />
          )}
        </Space>
      </div>

      {/* 错误提示 */}
      {editorStore.error && (
        <Alert
          message={editorStore.error}
          type="error"
          closable
          onClose={() => editorStore.setError(null)}
          className="editor-alert"
        />
      )}

      {/* 主内容区 */}
      <div className="editor-main">
        {/* 左侧节点库 */}
        <div className="editor-main__left">
          <NodeLibrary />
        </div>

        {/* 中间画布 */}
        <div className="editor-main__center">
          {editorStore.loading ? (
            <div className="editor-main__loading">
              <Spin size="large" tip="加载中..." />
            </div>
          ) : (
            <FlowEditor />
          )}
        </div>

        {/* 右侧属性面板 */}
        <div className="editor-main__right">
          {runPanelVisible ? (
            <RunPanel onClose={() => setRunPanelVisible(false)} />
          ) : (
            <NodeConfigPanel />
          )}
        </div>
      </div>
    </div>
  );
});

export default EditorPage;
