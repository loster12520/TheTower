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
  Form,
  Select,
  Switch,
  InputNumber,
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
  PauseCircleOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { history, useSearchParams } from 'umi';
import { editorStore, NODE_TYPES } from '@/stores/editorStore';
import { editorCollaborationStore } from '@/stores/editorCollaborationStore';
import { runStore } from '@/stores/runStore';
import { authStore } from '@/stores/authStore';
import { nodeTypes } from '@/nodes';
import NodeConfigPanel from '@/components/NodeConfigPanel';
import RunPanel from '@/components/RunPanel';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import { appLogger, buildWsUrl } from '@/config/runtime';
import { formatCanvasDiffSummary, getCanvasDiffGuidance, type CanvasDiffSummary } from '@/utils/collaborationDiff';
import { validateCanvas } from '@/utils/validator';
import type { NodeGroup } from '@/models/stepRegistry';
import type { NodeType } from '@/stores/editorStore';
import type { RemoteNodePreview } from '@/stores/editorCollaborationStore';
import type { RunEvent } from '@/stores/runStore';
import type { CollaborationPatchAppliedEvent, CollaborationPresenceChangedEvent, RunLaunchOptions, TemplatePatchAppliedData } from '@/models';
import './index.scss';

declare global {
  interface Window {
    __THETOWER_TEST__?: {
      getRootGraph: () => { nodes: Node[]; edges: Edge[] };
      injectCollaborationRemoteDiff: (payload: {
        patch: TemplatePatchAppliedData;
        remoteNodes: Node[];
        remoteEdges: Edge[];
      }) => boolean;
      clearCollaborationRemoteDiff: () => void;
    };
  }
}

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

const renderDiffDetailSection = (
  title: string,
  summary: CanvasDiffSummary | null,
  emptyText: string,
  locateNode?: (nodeId: string, label: string) => void,
  previewNode?: (nodeId: string, label: string) => void,
  adoptNode?: (nodeId: string, label: string) => void,
  adoptRemovedNode?: (nodeId: string, label: string) => void,
  adoptAddedEdge?: (edgeId: string, label: string) => void,
  adoptRemovedEdge?: (edgeId: string, label: string) => void,
) => {
  const renderNodeGroup = (
    testId: string,
    label: string,
    nodes: Array<{ id: string; label: string }>,
    mode: 'tag' | 'locate' | 'preview' | 'remove',
  ) => {
    if (nodes.length === 0) {
      return null;
    }

    return (
      <div data-testid={testId}>
        <div>{label}</div>
        <Space wrap>
          {nodes.map((node) => {
            if (mode === 'locate' && locateNode) {
              return (
                <Button
                  key={`${testId}-${node.id}`}
                  size="small"
                  onClick={() => locateNode(node.id, node.label)}
                >
                  定位到 {node.label}
                </Button>
              );
            }

            if (mode === 'preview' && previewNode) {
              return (
                <Space key={`${testId}-${node.id}`} size={4} wrap>
                  <Button
                    size="small"
                    onClick={() => previewNode(node.id, node.label)}
                  >
                    预览远端 {node.label}
                  </Button>
                  {adoptNode ? (
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      onClick={() => adoptNode(node.id, node.label)}
                    >
                      采纳远端 {node.label}
                    </Button>
                  ) : null}
                </Space>
              );
            }

            if (mode === 'remove' && adoptRemovedNode) {
              return (
                <Button
                  key={`${testId}-${node.id}`}
                  size="small"
                  danger
                  onClick={() => adoptRemovedNode(node.id, node.label)}
                >
                  采纳远端删除 {node.label}
                </Button>
              );
            }

            return <Tag key={`${testId}-${node.id}`}>{node.label}</Tag>;
          })}
        </Space>
      </div>
    );
  };

  const isLocalSection = title === '本地变更';
  const isRemoteSection = title === '远端变更';

  const renderEdgeGroup = (
    testId: string,
    label: string,
    edges: Array<{ id: string; label: string }>,
    mode: 'tag' | 'adopt-add' | 'adopt-remove',
  ) => {
    if (edges.length === 0) {
      return null;
    }

    return (
      <div data-testid={testId}>
        <div>{label}</div>
        <Space wrap>
          {edges.map((edge) => {
            if (mode === 'adopt-add' && adoptAddedEdge) {
              return (
                <Button
                  key={`${testId}-${edge.id}`}
                  size="small"
                  onClick={() => adoptAddedEdge(edge.id, edge.label)}
                >
                  采纳远端新增连线 {edge.label}
                </Button>
              );
            }

            if (mode === 'adopt-remove' && adoptRemovedEdge) {
              return (
                <Button
                  key={`${testId}-${edge.id}`}
                  size="small"
                  danger
                  onClick={() => adoptRemovedEdge(edge.id, edge.label)}
                >
                  采纳远端删除连线 {edge.label}
                </Button>
              );
            }

            return <Tag key={`${testId}-${edge.id}`}>{edge.label}</Tag>;
          })}
        </Space>
      </div>
    );
  };

  return (
    <Card size="small" title={title} data-testid={`editor-collaboration-diff-section-${title}`}>
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <span>{formatCanvasDiffSummary(title, summary)}</span>
        {summary && summary.totalChanges > 0 ? (
          <>
            {renderNodeGroup(
              `editor-collaboration-${title}-added`,
              '新增节点',
              summary.addedNodes,
              isLocalSection ? 'locate' : isRemoteSection ? 'preview' : 'tag',
            )}
            {renderNodeGroup(
              `editor-collaboration-${title}-removed`,
              '删除节点',
              summary.removedNodes,
              isRemoteSection ? 'remove' : 'tag',
            )}
            {renderNodeGroup(
              `editor-collaboration-${title}-updated`,
              '修改节点',
              summary.updatedNodes,
              isLocalSection ? 'locate' : isRemoteSection ? 'preview' : 'tag',
            )}
            {(summary.addedEdgeCount > 0 || summary.removedEdgeCount > 0) && (
              <span>{`连线变化：+${summary.addedEdgeCount} / -${summary.removedEdgeCount}`}</span>
            )}
            {renderEdgeGroup(
              `editor-collaboration-${title}-added-edges`,
              '新增连线',
              summary.addedEdges,
              isRemoteSection ? 'adopt-add' : 'tag',
            )}
            {renderEdgeGroup(
              `editor-collaboration-${title}-removed-edges`,
              '删除连线',
              summary.removedEdges,
              isRemoteSection ? 'adopt-remove' : 'tag',
            )}
          </>
        ) : <span>{emptyText}</span>}
      </Space>
    </Card>
  );
};

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
          <div key={group} data-testid={`node-group-${group}`} className="editor-node-library__group">
            <div className="editor-node-library__group-title">
              <span>{groupLabels[group as NodeGroup]}</span>
              <span className="editor-node-library__group-count">{items.length}</span>
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
                  <span className="editor-node-library__icon-shell">
                    <span className="editor-node-library__icon">{nodeType.icon}</span>
                  </span>
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
  const [launchOptionsVisible, setLaunchOptionsVisible] = React.useState(false);
  const [diffDetailVisible, setDiffDetailVisible] = React.useState(false);
  const [remotePreviewNodeId, setRemotePreviewNodeId] = React.useState<string | null>(null);
  const autoRunAttemptRef = useRef<string | null>(null);
  const [launchOptionsForm] = Form.useForm<RunLaunchOptions>();
  const runParam = searchParams.get('run');
  const requestedRunMode: 'normal' | 'debug' | 'debug-pause' | null = runParam === 'debug'
    ? 'debug'
    : runParam === 'debug-pause'
      ? 'debug-pause'
      : runParam
        ? 'normal'
        : null;

  const syncRemoteTemplate = useCallback(async () => {
    if (!templateId) {
      return false;
    }

    const reloaded = await editorStore.loadTemplate(templateId);
    if (reloaded) {
      editorCollaborationStore.clearRemotePatch();
      editorCollaborationStore.clearResolvedRemotePatch();
    }
    return reloaded;
  }, [templateId]);

  const saveLocalTemplate = useCallback(async () => {
    const success = await editorStore.saveTemplate();
    if (success) {
      editorCollaborationStore.clearRemotePatch();
      editorCollaborationStore.clearResolvedRemotePatch();
      message.success('已保存本地版本');
    } else if (editorStore.error) {
      message.error(editorStore.error);
    }
    return success;
  }, []);

  const locateLocalDiffNode = useCallback((nodeId: string, label: string) => {
    const focused = editorStore.focusRootNode(nodeId);
    if (focused) {
      message.info(`已定位到本地节点：${label}`);
      setDiffDetailVisible(false);
    }
  }, []);

  const previewRemoteDiffNode = useCallback((nodeId: string, label: string) => {
    const remoteNode = editorCollaborationStore.getRemoteNodePreview(nodeId);
    if (!remoteNode) {
      message.warning(`暂时无法预览远端节点：${label}`);
      return;
    }

    setDiffDetailVisible(false);
    setRemotePreviewNodeId(remoteNode.id);
  }, []);

  const adoptRemoteDiffNode = useCallback((nodeId: string, label: string) => {
    const remoteNodePayload = editorCollaborationStore.getRemoteNodeMergePayload(nodeId);
    if (!remoteNodePayload) {
      message.warning(`暂时无法采纳远端节点：${label}`);
      return;
    }

    const applied = editorStore.applyRemoteRootNode(remoteNodePayload.node, remoteNodePayload.connectedEdges);
    if (applied) {
      editorCollaborationStore.refreshRemoteDiffProgress(editorStore.rootNodes, editorStore.rootEdges);
      message.success(`已采纳远端节点：${label}`);
    }
  }, []);

  const adoptRemoteRemovedNode = useCallback((nodeId: string, label: string) => {
    const removed = editorStore.applyRemoteRootNodeRemoval(nodeId);
    if (!removed) {
      message.warning(`本地已不存在节点：${label}`);
      return;
    }

    editorCollaborationStore.refreshRemoteDiffProgress(editorStore.rootNodes, editorStore.rootEdges);
    message.success(`已采纳远端删除：${label}`);
  }, []);

  const adoptRemoteAddedEdge = useCallback((edgeId: string, label: string) => {
    const remoteEdge = editorCollaborationStore.getRemoteEdgeMergePayload(edgeId);
    if (!remoteEdge) {
      message.warning(`暂时无法采纳远端连线：${label}`);
      return;
    }

    const applied = editorStore.applyRemoteRootEdge(remoteEdge);
    if (!applied) {
      message.warning(`当前无法采纳远端连线：${label}`);
      return;
    }

    editorCollaborationStore.refreshRemoteDiffProgress(editorStore.rootNodes, editorStore.rootEdges);
    message.success(`已采纳远端新增连线：${label}`);
  }, []);

  const adoptRemoteRemovedEdge = useCallback((edgeId: string, label: string) => {
    const removed = editorStore.applyRemoteRootEdgeRemoval(edgeId);
    if (!removed) {
      message.warning(`本地已不存在连线：${label}`);
      return;
    }

    editorCollaborationStore.refreshRemoteDiffProgress(editorStore.rootNodes, editorStore.rootEdges);
    message.success(`已采纳远端删除连线：${label}`);
  }, []);

  const remotePreviewNode: RemoteNodePreview | null = remotePreviewNodeId
    ? editorCollaborationStore.getRemoteNodePreview(remotePreviewNodeId)
    : null;

  const remotePreviewNodeTypeLabel = remotePreviewNode
    ? NODE_TYPES.find((item) => item.type === remotePreviewNode.type)?.label || remotePreviewNode.type
    : '';
  const remoteDiffGuidance = getCanvasDiffGuidance(editorCollaborationStore.remoteDiffSummary);

  useEffect(() => {
    if (diffDetailVisible && !editorCollaborationStore.remotePatch) {
      setDiffDetailVisible(false);
    }
  }, [diffDetailVisible, editorCollaborationStore.remotePatch]);

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

  const collaborationWsUrl = editorCollaborationStore.websocketUrl;
  const { status: collaborationWsStatus } = useWebSocket(collaborationWsUrl, {
    key: collaborationWsUrl || `editor-collaboration-${templateId || 'anonymous'}`,
    onMessage: (data: CollaborationPresenceChangedEvent | CollaborationPatchAppliedEvent) => {
      if (data.type === 'COLLABORATION_PRESENCE_CHANGED') {
        editorCollaborationStore.handlePresenceEvent(
          data,
          authStore.currentUser?.userId,
          authStore.currentUser?.workspaceId,
        );
        return;
      }

      if (data.type === 'COLLABORATION_PATCH_APPLIED') {
        editorCollaborationStore.handlePatchEvent(
          data,
          authStore.currentUser?.userId,
          authStore.currentUser?.workspaceId,
        );
      }
    },
    onOpen: () => {
      editorCollaborationStore.setSocketStatus('open');
      if (templateId) {
        void editorCollaborationStore.heartbeat(templateId);
      }
    },
    onClose: () => {
      editorCollaborationStore.setSocketStatus('closed');
    },
    onError: () => {
      editorCollaborationStore.setSocketStatus('error');
    },
  });

  useEffect(() => {
    void authStore.hydrate();
  }, []);

  // 加载模板数据
  useEffect(() => {
    if (templateId) {
      editorStore.loadTemplate(templateId);
    }
  }, [templateId]);

  useEffect(() => {
    editorCollaborationStore.setSocketStatus(collaborationWsStatus);
  }, [collaborationWsStatus]);

  useEffect(() => {
    if (!templateId || !authStore.isLoggedIn) {
      editorCollaborationStore.reset();
      return;
    }

    editorCollaborationStore.bindTemplate(templateId);
    void editorCollaborationStore.fetchPresence(
      templateId,
      authStore.currentUser?.userId,
      authStore.currentUser?.workspaceId,
    );
    void editorCollaborationStore.heartbeat(templateId);

    const heartbeatTimer = window.setInterval(() => {
      void editorCollaborationStore.heartbeat(templateId);
    }, 10_000);

    return () => {
      window.clearInterval(heartbeatTimer);
      void editorCollaborationStore.leavePresence(templateId);
      editorCollaborationStore.reset();
    };
  }, [templateId, authStore.currentUser?.userId, authStore.currentUser?.workspaceId, authStore.isLoggedIn]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.__THETOWER_TEST__ = {
      getRootGraph: () => ({
        nodes: editorStore.rootNodes,
        edges: editorStore.rootEdges,
      }),
      injectCollaborationRemoteDiff: ({ patch, remoteNodes, remoteEdges }) => editorCollaborationStore.injectRemoteDiffForTesting({
        patch,
        baselineNodes: editorStore.persistedRootNodes,
        baselineEdges: editorStore.persistedRootEdges,
        remoteNodes,
        remoteEdges,
        currentUserId: authStore.currentUser?.userId,
        currentWorkspaceId: authStore.currentUser?.workspaceId,
      }),
      clearCollaborationRemoteDiff: () => editorCollaborationStore.clearRemotePatch(),
    };

    return () => {
      delete window.__THETOWER_TEST__;
    };
  }, [authStore.currentUser?.userId, authStore.currentUser?.workspaceId]);

  useEffect(() => {
    if (!templateId || !authStore.isLoggedIn) {
      return;
    }

    const pollRemoteState = async () => {
      await editorCollaborationStore.fetchPresence(
        templateId,
        authStore.currentUser?.userId,
        authStore.currentUser?.workspaceId,
      );

      const patch = await editorCollaborationStore.detectRemoteTemplateChange(
        templateId,
        editorStore.lastSavedAt,
        authStore.currentUser?.userId,
        authStore.currentUser?.workspaceId,
      );

      if (patch && !editorStore.isDirty && !editorStore.loading && !editorStore.saving) {
        const reloaded = await editorStore.loadTemplate(templateId);
        if (reloaded) {
          message.info(`${patch.savedByUserName} 的更新已自动同步`);
          editorCollaborationStore.clearRemotePatch();
          editorCollaborationStore.clearResolvedRemotePatch();
        }
      }
    };

    void pollRemoteState();
    const pollingTimer = window.setInterval(() => {
      void pollRemoteState();
    }, 2_000);

    return () => window.clearInterval(pollingTimer);
  }, [templateId, authStore.currentUser?.userId, authStore.currentUser?.workspaceId, authStore.isLoggedIn]);

  useEffect(() => {
    if (!templateId || !editorCollaborationStore.remotePatch || editorStore.loading || editorStore.saving) {
      return;
    }

    if (editorStore.isDirty) {
      return;
    }

    void (async () => {
      const reloaded = await editorStore.loadTemplate(templateId);
      if (reloaded && editorCollaborationStore.remotePatch) {
        message.info(`${editorCollaborationStore.remotePatch.savedByUserName} 的更新已自动同步`);
      }
      editorCollaborationStore.clearRemotePatch();
      editorCollaborationStore.clearResolvedRemotePatch();
    })();
  }, [
    templateId,
    editorStore.isDirty,
    editorStore.loading,
    editorStore.saving,
    editorCollaborationStore.remotePatch?.updatedAt,
  ]);

  useEffect(() => {
    if (!editorStore.isDirty && editorCollaborationStore.resolvedRemotePatch) {
      editorCollaborationStore.clearResolvedRemotePatch();
    }
  }, [editorStore.isDirty, editorStore.lastSavedAt, editorCollaborationStore.resolvedRemotePatch?.updatedAt]);

  useEffect(() => {
    if (!templateId || !editorCollaborationStore.remotePatch || !editorStore.isDirty) {
      return;
    }

    void editorCollaborationStore.hydrateRemoteDiff(
      templateId,
      editorStore.persistedRootNodes,
      editorStore.persistedRootEdges,
    );
  }, [
    templateId,
    editorStore.isDirty,
    editorCollaborationStore.remotePatch?.updatedAt,
    editorStore.lastSavedAt,
  ]);

  useEffect(() => {
    if (
      !templateId
      || editorStore.loading
      || editorStore.saving
      || !editorStore.isDirty
      || editorCollaborationStore.remotePatch
      || editorCollaborationStore.onlineCount > 1
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void editorStore.saveTemplate('auto');
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [
    templateId,
    editorStore.loading,
    editorStore.saving,
    editorStore.isDirty,
    editorStore.nodes.length,
    editorStore.edges.length,
    editorCollaborationStore.remotePatch?.updatedAt,
    editorCollaborationStore.onlineCount,
  ]);

  // 保存
  const handleSave = async () => {
    if (editorCollaborationStore.remotePatch && editorStore.isDirty) {
      Modal.confirm({
        title: '发现协作冲突',
        content: editorCollaborationStore.remotePatchLabel || '协作者刚刚保存了模板。继续保存会覆盖远端最新版本。',
        okText: '仍然保存本地版本',
        cancelText: '先查看远端更新',
        onOk: async () => {
          await saveLocalTemplate();
        },
      });
      return;
    }

    const success = await editorStore.saveTemplate();
    if (success) {
      editorCollaborationStore.clearResolvedRemotePatch();
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

  const handlePauseOnStartDebugRun = async () => {
    await handleRunWithMode('debug-pause');
  };

  const handleOpenLaunchOptions = () => {
    launchOptionsForm.setFieldsValue(runStore.runLaunchOptions);
    setLaunchOptionsVisible(true);
  };

  const handleSubmitLaunchOptions = async () => {
    const values = await launchOptionsForm.validateFields();
    runStore.setRunLaunchOptions(values);
    setLaunchOptionsVisible(false);
    message.success('运行参数已更新');
  };

  const handleRunWithMode = async (mode: 'normal' | 'debug' | 'debug-pause') => {
    if (!templateId) return;

    if (editorStore.isDirty) {
      const saved = await editorStore.saveTemplate();
      if (!saved) {
        message.error(`保存失败，无法启动${mode === 'normal' ? '运行' : '调试运行'}`);
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

  const startRun = async (mode: 'normal' | 'debug' | 'debug-pause' = 'normal') => {
    if (!templateId) return;

    const isDebug = mode !== 'normal';
    const breakpoints = editorStore.debugBreakpoints;

    const success = await runStore.startRun(templateId, isDebug ? {
      debug: {
        enabled: true,
        openVisibleBrowser: true,
        openDevtools: true,
        previewFps: 2,
        previewQuality: 60,
        pauseOnStart: mode === 'debug-pause',
        breakpoints,
        keepBrowserOnFinish: true,
      },
      launchOptions: runStore.runLaunchOptions,
    } : {
      launchOptions: runStore.runLaunchOptions,
    });
    if (success) {
      setRunPanelVisible(true);
      if (mode === 'debug-pause') {
        message.success('调试运行已启动，并将在首个步骤前暂停');
      } else {
        message.success(mode === 'debug' ? '调试运行已启动' : '运行已启动');
      }
    } else if (runStore.error) {
      message.error(runStore.error);
    }
  };

  useEffect(() => {
    if (!templateId || !requestedRunMode) {
      return;
    }

    if (editorStore.loading || editorStore.templateId !== templateId || runStore.isLoading || !!runStore.currentRun) {
      return;
    }

    const autoRunKey = `${templateId}:${requestedRunMode}`;
    if (autoRunAttemptRef.current === autoRunKey) {
      return;
    }

    autoRunAttemptRef.current = autoRunKey;

    void (async () => {
      await handleRunWithMode(requestedRunMode);

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete('run');
      const nextQuery = nextParams.toString();
      history.replace(nextQuery ? `/editor?${nextQuery}` : '/editor');
    })();
  }, [editorStore.loading, editorStore.templateId, requestedRunMode, runStore.currentRun, runStore.isLoading, searchParams, templateId]);

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

  const handleAutoLayout = () => {
    editorStore.autoLayoutCurrentCanvas();
    message.success(editorStore.isEditingSubflow ? '子流程已自动布局' : '主流程已自动布局');
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
          {authStore.isLoggedIn && templateId && (
            <div className="editor-toolbar__presence" data-testid="editor-collaboration-presence">
              <Tag color={editorCollaborationStore.onlineCount > 1 ? 'processing' : 'default'}>
                在线 {editorCollaborationStore.onlineCount}
              </Tag>
              <span className="editor-toolbar__presence-status">{editorCollaborationStore.connectionLabel}</span>
              {editorCollaborationStore.members.slice(0, 3).map((member) => {
                const isCurrentUser = member.userId === authStore.currentUser?.userId
                  && member.workspaceId === authStore.currentUser?.workspaceId;
                return (
                  <Tag key={`${member.userId}-${member.workspaceId}`} color={isCurrentUser ? 'gold' : 'blue'}>
                    {member.userName}
                  </Tag>
                );
              })}
              {editorCollaborationStore.members.length > 3 && (
                <Tag>+{editorCollaborationStore.members.length - 3}</Tag>
              )}
            </div>
          )}
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
          <Tooltip title="自动布局当前画布">
            <Button size="small" icon={<ApartmentOutlined />} disabled={editorStore.nodes.length === 0} onClick={handleAutoLayout} />
          </Tooltip>
          <Tooltip title="配置本次运行使用的浏览器、无头模式与默认超时">
            <Button size="small" onClick={handleOpenLaunchOptions}>
              运行参数
            </Button>
          </Tooltip>
        </Space>

        <Space>
          {editorStore.isDirty && editorCollaborationStore.onlineCount > 1 && !editorCollaborationStore.remotePatch && (
            <Tag color="warning" data-testid="editor-collaboration-autosave-paused-tag">
              协作中暂停自动保存
            </Tag>
          )}
          {editorCollaborationStore.remotePatch && editorStore.isDirty && (
            <Tag color="error" data-testid="editor-collaboration-conflict-tag">
              协作冲突
            </Tag>
          )}
          {!editorCollaborationStore.remotePatch && editorStore.isDirty && editorCollaborationStore.resolvedRemotePatch && (
            <Tag color="processing" data-testid="editor-collaboration-merge-pending-tag">
              合并结果待保存
            </Tag>
          )}
          <Tag color={editorStore.lastSaveError ? 'error' : editorStore.isDirty ? 'warning' : 'success'} className="editor-toolbar__save-status">
            {editorStore.saveStatusLabel}
          </Tag>
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
              <Tooltip title="从第一个步骤前暂停，适合检查初始变量与上下文。">
                <Button
                  icon={<PauseCircleOutlined />}
                  onClick={handlePauseOnStartDebugRun}
                  disabled={editorStore.nodes.length === 0}
                >
                  启动即暂停
                </Button>
              </Tooltip>
            </>
          )}

          {runStore.isRunning && (
            <Badge status="processing" text="运行中" />
          )}
        </Space>
      </div>

      <Modal
        title="运行参数"
        open={launchOptionsVisible}
        onOk={handleSubmitLaunchOptions}
        onCancel={() => setLaunchOptionsVisible(false)}
        destroyOnHidden
      >
        <Form form={launchOptionsForm} layout="vertical" initialValues={runStore.runLaunchOptions}>
          <Form.Item label="浏览器" name="browser" rules={[{ required: true, message: '请选择浏览器' }]}>
            <Select
              options={[
                { label: 'Chromium', value: 'chromium' },
                { label: 'Chrome', value: 'chrome' },
                { label: 'Edge', value: 'edge' },
                { label: 'Firefox', value: 'firefox' },
                { label: 'WebKit', value: 'webkit' },
              ]}
            />
          </Form.Item>
          <Form.Item label="无头模式" name="headless" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item
            label="默认超时(ms)"
            name="defaultTimeoutMs"
            rules={[{ required: true, message: '请输入默认超时' }]}
            extra="范围 1000 - 120000，所有节点未单独声明超时时将使用此值。"
          >
            <InputNumber min={1000} max={120000} step={1000} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="协作冲突差异详情"
        open={diffDetailVisible}
        onCancel={() => setDiffDetailVisible(false)}
        footer={null}
        destroyOnHidden
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }} data-testid="editor-collaboration-diff-modal">
          {renderDiffDetailSection('本地变更', editorStore.localChangeSummary, '当前本地只存在轻微元数据变化或暂无结构差异。', locateLocalDiffNode)}
          {editorCollaborationStore.remoteResolvedChangeCount > 0 && editorCollaborationStore.hasRemainingRemoteDiffs ? (
            <Alert
              type="success"
              showIcon
              data-testid="editor-collaboration-remote-resolved-alert"
              message={`已解决 ${editorCollaborationStore.remoteResolvedChangeCount} 项远端差异，当前仅显示未解决项。`}
            />
          ) : null}
          {remoteDiffGuidance ? (
            <Alert
              type={remoteDiffGuidance.level}
              showIcon
              data-testid="editor-collaboration-remote-guidance-alert"
              message={remoteDiffGuidance.title}
              description={remoteDiffGuidance.description}
            />
          ) : null}
          {renderDiffDetailSection(
            '远端变更',
            editorCollaborationStore.remoteDiffSummary,
            '远端差异仍在加载，或本次更新主要是元数据变化。',
            undefined,
            previewRemoteDiffNode,
            adoptRemoteDiffNode,
            adoptRemoteRemovedNode,
            adoptRemoteAddedEdge,
            adoptRemoteRemovedEdge,
          )}
        </Space>
      </Modal>

      <Modal
        title="远端节点预览"
        open={!!remotePreviewNode}
        onCancel={() => setRemotePreviewNodeId(null)}
        footer={null}
        destroyOnHidden
      >
        {remotePreviewNode ? (
          <Space direction="vertical" size="small" style={{ width: '100%' }} data-testid="editor-collaboration-remote-preview-modal">
            <Card size="small" title={remotePreviewNode.label}>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <span>{`节点类型：${remotePreviewNodeTypeLabel}`}</span>
                <span>{`节点坐标：(${Math.round(remotePreviewNode.position.x)}, ${Math.round(remotePreviewNode.position.y)})`}</span>
              </Space>
            </Card>
            <Card size="small" title="远端配置">
              <pre data-testid="editor-collaboration-remote-preview-config" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(remotePreviewNode.config, null, 2)}
              </pre>
            </Card>
          </Space>
        ) : null}
      </Modal>

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

      {editorCollaborationStore.remotePatch && editorStore.isDirty && (
        <Alert
          message="远端模板已更新，当前存在协作冲突"
          description={(
            <Space direction="vertical" size={4} data-testid="editor-collaboration-conflict-summary">
              <span>{editorCollaborationStore.remotePatchLabel || '协作者刚刚保存了模板，请决定何时同步远端版本。'}</span>
              <span data-testid="editor-collaboration-local-diff">{formatCanvasDiffSummary('本地变更', editorStore.localChangeSummary)}</span>
              <span data-testid="editor-collaboration-remote-diff">{formatCanvasDiffSummary('远端变更', editorCollaborationStore.remoteDiffSummary)}</span>
            </Space>
          )}
          type="warning"
          showIcon
          data-testid="editor-collaboration-conflict-alert"
          action={(
            <Space>
              <Button size="small" onClick={() => setDiffDetailVisible(true)}>
                查看差异详情
              </Button>
              <Button
                size="small"
                onClick={() => {
                  Modal.confirm({
                    title: '同步远端模板',
                    content: '同步后会丢弃当前页面的未保存改动。',
                    okText: '丢弃并同步',
                    cancelText: '取消',
                    onOk: async () => {
                      const reloaded = await syncRemoteTemplate();
                      if (reloaded) {
                        message.success('已同步远端最新模板');
                      }
                    },
                  });
                }}
              >
                丢弃并同步
              </Button>
              <Button size="small" type="primary" ghost onClick={() => void saveLocalTemplate()}>
                覆盖保存
              </Button>
            </Space>
          )}
          className="editor-alert"
        />
      )}

      {!editorCollaborationStore.remotePatch && editorStore.isDirty && editorCollaborationStore.resolvedRemotePatch && (
        <Alert
          message="远端冲突已解决，本地合并结果尚未保存"
          description={editorCollaborationStore.resolvedRemotePatchLabel || '远端差异已经处理完成，请在确认本地合并结果后保存当前模板。'}
          type="info"
          showIcon
          data-testid="editor-collaboration-merge-pending-alert"
          action={(
            <Button size="small" type="primary" onClick={() => void saveLocalTemplate()}>
              保存合并结果
            </Button>
          )}
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
