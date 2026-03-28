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
  Tag,
} from 'antd';
import {
  SaveOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ArrowLeftOutlined,
  CopyOutlined,
  ScissorOutlined,
  SnippetsOutlined,
  UndoOutlined,
  RedoOutlined,
  BugOutlined,
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
import type { NodeGroup } from '@/models/stepRegistry';
import type { NodeType } from '@/stores/editorStore';
import type { RunEvent } from '@/stores/runStore';
import './index.scss';

const groupLabels: Record<NodeGroup, string> = {
  page: '页面操作',
  wait: '等待操作',
  data: '获取数据',
  flow: '流程管理',
};

const AUTO_CONNECT_THRESHOLD = 50;
const DEFAULT_NODE_SIZE = { width: 180, height: 72 };
const DEFAULT_CONTAINER_SIZE = { width: 260, height: 190 };

const getNodeSize = (node: Node) => {
  const measured = node.measured as { width?: number; height?: number } | undefined;
  if (measured?.width && measured?.height) {
    return { width: measured.width, height: measured.height };
  }
  return NODE_TYPES.some((item) => item.type === node.type && item.isContainer)
    ? DEFAULT_CONTAINER_SIZE
    : DEFAULT_NODE_SIZE;
};

const getAutoConnectCandidate = (allNodes: Node[], draggedNode: Node): Connection | null => {
  let bestCandidate: Connection | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  const tryCandidate = (sourceNode: Node, targetNode: Node) => {
    const sourceSize = getNodeSize(sourceNode);
    const targetSize = getNodeSize(targetNode);
    const horizontalGap = targetNode.position.x - (sourceNode.position.x + sourceSize.width);
    const verticalGap = Math.abs(
      sourceNode.position.y + sourceSize.height / 2 - (targetNode.position.y + targetSize.height / 2),
    );

    if (horizontalGap < -16 || horizontalGap > AUTO_CONNECT_THRESHOLD) {
      return;
    }

    if (verticalGap > AUTO_CONNECT_THRESHOLD) {
      return;
    }

    const distance = Math.hypot(Math.max(horizontalGap, 0), verticalGap);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidate = { source: sourceNode.id, target: targetNode.id };
    }
  };

  allNodes.forEach((otherNode) => {
    if (otherNode.id === draggedNode.id) {
      return;
    }

    tryCandidate(draggedNode, otherNode);
    tryCandidate(otherNode, draggedNode);
  });

  return bestCandidate;
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
};

// 画布编辑区域
const FlowEditorInner: React.FC = observer(() => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  
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

  const handleNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    editorStore.updateNodePosition(node.id, node.position);

    const bestCandidate = getAutoConnectCandidate(nodes, node);

    if (bestCandidate && editorStore.addEdge(bestCandidate, { silent: true })) {
      setEdges((currentEdges) => addEdge({ ...bestCandidate, type: 'smoothstep' }, currentEdges));
    }
  }, [nodes, setEdges]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow') as NodeType;
    if (!type || !reactFlowWrapper.current) return;

    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    editorStore.addNode(type, position);
  }, [screenToFlowPosition]);

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
        onNodeDragStop={handleNodeDragStop}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={['Delete', 'Backspace']}
        connectionRadius={AUTO_CONNECT_THRESHOLD}
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
const NodeLibrary: React.FC = observer(() => {
  const onDragStart = (event: React.DragEvent, type: NodeType) => {
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  const groupedNodeTypes = editorStore.availableNodeTypes.reduce<Record<NodeGroup, typeof editorStore.availableNodeTypes>>((acc, nodeType) => {
    const group = nodeType.group as NodeGroup;
    acc[group] = [...(acc[group] || []), nodeType];
    return acc;
  }, { page: [], wait: [], data: [], flow: [] });

  return (
    <Card 
      title="节点库" 
      size="small" 
      className="editor-node-library"
      styles={{ body: { padding: 12 } }}
    >
      <Flex vertical gap="middle">
        {Object.entries(groupedNodeTypes).map(([group, items]) => items.length > 0 ? (
          <div key={group} data-testid={`node-group-${group}`}>
            <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: '0.04em' }}>
              {groupLabels[group as NodeGroup]}
            </div>
            <Flex vertical gap="small">
              {items.map((nodeType) => (
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
          </div>
        ) : null)}
      </Flex>
      <Divider className="editor-node-library__divider" />
      <div className="editor-node-library__hint">{editorStore.activeSubflowHint}</div>
    </Card>
  );
});

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
    await handleRunWithMode('normal');
  };

  const handleDebugRun = async () => {
    await handleRunWithMode('debug');
  };

  const handleRunWithMode = async (mode: 'normal' | 'debug') => {
    if (!templateId) return;

    if (editorStore.isDirty) {
      const saved = await editorStore.saveTemplate();
      if (!saved) {
        message.error(`保存失败，无法启动${mode === 'debug' ? '调试运行' : '运行'}`);
        return;
      }
    }

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
        onOk: () => startRun(mode),
      });
    } else {
      startRun(mode);
    }
  };

  const startRun = async (mode: 'normal' | 'debug' = 'normal') => {
    if (!templateId) return;

    const success = await runStore.startRun(templateId, mode === 'debug' ? {
      debug: {
        enabled: true,
        openVisibleBrowser: true,
        openDevtools: true,
        previewFps: 2,
        previewQuality: 60,
      },
    } : undefined);
    if (success) {
      setRunPanelVisible(true);
      message.success(mode === 'debug' ? '调试运行已启动' : '运行已启动');
    } else if (runStore.error) {
      message.error(runStore.error);
    }
  };

  // 取消运行
  const handleCancelRun = async () => {
    await runStore.cancelRun();
    disconnect();
  };

  const handleCopy = () => {
    if (!editorStore.copySelection()) {
      message.warning('请先选中一个节点');
    } else {
      message.success('节点已复制');
    }
  };

  const handleCut = () => {
    if (!editorStore.cutSelection()) {
      message.warning('请先选中一个节点');
    } else {
      message.success('节点已剪切');
    }
  };

  const handlePaste = () => {
    if (!editorStore.pasteSelection()) {
      message.warning('当前没有可粘贴的节点');
    } else {
      message.success('节点已粘贴');
    }
  };

  const handleUndo = () => {
    if (!editorStore.undo()) {
      message.warning('没有可撤销的操作');
    }
  };

  const handleRedo = () => {
    if (!editorStore.redo()) {
      message.warning('没有可恢复的操作');
    }
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
      const normalizedKey = e.key.toLowerCase();
      const commandPressed = e.ctrlKey || e.metaKey;
      const typingTarget = isTypingTarget(e.target);

      if (commandPressed && normalizedKey === 's') {
        e.preventDefault();
        handleSave();
        return;
      }

      if (!commandPressed || typingTarget) {
        return;
      }

      if (normalizedKey === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }

      if (normalizedKey === 'x') {
        e.preventDefault();
        handleCut();
        return;
      }

      if (normalizedKey === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      if (normalizedKey === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (normalizedKey === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (normalizedKey === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorStore.selectedNode, editorStore.canPasteSelection, editorStore.canUndo, editorStore.canRedo]);

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
          <Tag color={editorStore.isEditingSubflow ? 'processing' : 'default'}>
            {editorStore.canvasScopeLabel}
          </Tag>
          {editorStore.isEditingSubflow && editorStore.activeSubflowBranches.map((branch) => (
            <Button
              key={branch}
              size="small"
              type={editorStore.activeSubflow?.branch === branch ? 'primary' : 'default'}
              onClick={() => {
                if (editorStore.activeSubflow) {
                  editorStore.enterSubflow(editorStore.activeSubflow.nodeId, branch);
                }
              }}
            >
              {branch.toUpperCase()}
            </Button>
          ))}
          {editorStore.isEditingSubflow && (
            <Button size="small" onClick={() => editorStore.exitSubflow()}>
              返回主流程
            </Button>
          )}
          <Tooltip title="复制 (Ctrl/Cmd+C)">
            <Button size="small" icon={<CopyOutlined />} disabled={!editorStore.canCopySelection} onClick={handleCopy} />
          </Tooltip>
          <Tooltip title="剪切 (Ctrl/Cmd+X)">
            <Button size="small" icon={<ScissorOutlined />} disabled={!editorStore.canCopySelection} onClick={handleCut} />
          </Tooltip>
          <Tooltip title="粘贴 (Ctrl/Cmd+V)">
            <Button size="small" icon={<SnippetsOutlined />} disabled={!editorStore.canPasteSelection} onClick={handlePaste} />
          </Tooltip>
          <Tooltip title="撤销 (Ctrl/Cmd+Z)">
            <Button size="small" icon={<UndoOutlined />} disabled={!editorStore.canUndo} onClick={handleUndo} />
          </Tooltip>
          <Tooltip title="重做 (Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y)">
            <Button size="small" icon={<RedoOutlined />} disabled={!editorStore.canRedo} onClick={handleRedo} />
          </Tooltip>
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
            <>
              <Button 
                icon={<PlayCircleOutlined />} 
                type="primary" 
                ghost
                onClick={handleRun}
                disabled={editorStore.nodes.length === 0}
              >
                运行
              </Button>
              <Tooltip title="调试运行会启动近实时预览，并在本地开发环境请求打开可见浏览器与 DevTools。">
                <Button
                  icon={<BugOutlined />}
                  onClick={handleDebugRun}
                  disabled={editorStore.nodes.length === 0}
                >
                  调试运行
                </Button>
              </Tooltip>
            </>
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
            <>
              {editorStore.isEditingSubflow && (
                <div className="editor-subflow-banner">
                  <Space>
                    <Tag color="processing">subflow 编辑中</Tag>
                    <span>{editorStore.canvasScopeLabel}</span>
                  </Space>
                </div>
              )}
              {editorStore.isEditingSubflow && (
                <div className="editor-subflow-workbench" data-testid="subflow-workbench">
                  <div className="editor-subflow-workbench__header">
                    <div>
                      <div className="editor-subflow-workbench__title">Subflow 工作台</div>
                      <div className="editor-subflow-workbench__scope">{editorStore.canvasScopeLabel}</div>
                    </div>
                    <Tag color={editorStore.isLoopBodyScope ? 'error' : 'processing'}>
                      {editorStore.isLoopBodyScope ? '循环 BODY' : '分支编辑'}
                    </Tag>
                  </div>
                  <div className="editor-subflow-workbench__meta">
                    <span>当前子步骤数 {editorStore.getActiveSubflowStepCount()}</span>
                    <span>{editorStore.activeSubflowHint}</span>
                  </div>
                </div>
              )}
              <FlowEditor />
            </>
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
