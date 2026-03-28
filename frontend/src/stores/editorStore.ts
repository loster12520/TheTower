import { makeAutoObservable, runInAction } from 'mobx';
import type { Node, Edge, Connection, XYPosition } from '@xyflow/react';
import { templateApi } from '@/services/api';
import { graphToSteps, stepsToGraph, createNode as createNewNode, generateId } from '@/utils/canvasConverter';
import { validateCanvas } from '@/utils/validator';
import { NODE_DEFINITIONS } from '@/models/stepRegistry';
import type { WorkflowTemplate, ApiError, Step, StepType } from '@/models';

export type NodeType = StepType;

export const NODE_TYPES = NODE_DEFINITIONS;

type BranchType = 'then' | 'else' | 'body';

interface FlowGraph {
  nodes: Node[];
  edges: Edge[];
}

interface ActiveSubflow {
  nodeId: string;
  branch: BranchType;
}

interface ClipboardGraph {
  nodes: Node[];
  edges: Edge[];
}

interface EditorSnapshot {
  rootNodes: Node[];
  rootEdges: Edge[];
  subflowGraphMap: Record<string, Partial<Record<BranchType, FlowGraph>>>;
  activeSubflow: ActiveSubflow | null;
  selectedNodeId: string | null;
}

const isBranchType = (value: string): value is BranchType => value === 'then' || value === 'else' || value === 'body';

const cloneConfig = (config: Record<string, unknown>) => JSON.parse(JSON.stringify(config ?? {})) as Record<string, unknown>;

const cloneNodes = (nodes: Node[]): Node[] => nodes.map((node) => ({
  ...node,
  position: { ...node.position },
  data: {
    ...node.data,
    config: cloneConfig((node.data?.config as Record<string, unknown>) || {}),
  },
}));

const cloneEdges = (edges: Edge[]): Edge[] => edges.map((edge) => ({ ...edge }));

const cloneGraph = (graph: FlowGraph): FlowGraph => ({
  nodes: cloneNodes(graph.nodes),
  edges: cloneEdges(graph.edges),
});

const cloneSubflowGraphMap = (graphMap: Record<string, Partial<Record<BranchType, FlowGraph>>>) => Object.fromEntries(
  Object.entries(graphMap).map(([nodeId, branches]) => [
    nodeId,
    Object.fromEntries(
      Object.entries(branches).map(([branch, graph]) => [
        branch,
        graph ? cloneGraph(graph) : graph,
      ]),
    ) as Partial<Record<BranchType, FlowGraph>>,
  ]),
) as Record<string, Partial<Record<BranchType, FlowGraph>>>;

class EditorStore {
  // 画布数据
  nodes: Node[] = [];
  edges: Edge[] = [];
  rootNodes: Node[] = [];
  rootEdges: Edge[] = [];
  selectedNode: Node | null = null;
  activeSubflow: ActiveSubflow | null = null;
  subflowGraphMap: Record<string, Partial<Record<BranchType, FlowGraph>>> = {};

  // 模板信息
  templateId: string | null = null;
  templateName = '';
  templateDescription: string | null = null;

  // 状态
  loading = false;
  saving = false;
  isDirty = false;
  error: string | null = null;

  // 编辑器体验增强
  clipboard: ClipboardGraph | null = null;
  pastSnapshots: EditorSnapshot[] = [];
  futureSnapshots: EditorSnapshot[] = [];

  // 运行状态
  isRunning = false;
  currentRunId: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get isEditingSubflow() {
    return this.activeSubflow !== null;
  }

  get canvasScopeLabel() {
    if (!this.activeSubflow) {
      return '主流程';
    }

    const rootNode = this.rootNodes.find((node) => node.id === this.activeSubflow?.nodeId);
    const nodeLabel = (rootNode?.data?.label as string | undefined) || this.activeSubflow.nodeId;
    return `子流程 / ${nodeLabel} / ${this.activeSubflow.branch.toUpperCase()}`;
  }

  get activeSubflowBranches(): BranchType[] {
    if (!this.activeSubflow) {
      return [];
    }

    const rootNode = this.rootNodes.find((node) => node.id === this.activeSubflow?.nodeId);
    if (!rootNode) {
      return [];
    }

    return Object.keys((rootNode.data?.config as Record<string, unknown>) || {})
      .filter(isBranchType);
  }

  get activeSubflowNode() {
    if (!this.activeSubflow) {
      return null;
    }

    return this.rootNodes.find((node) => node.id === this.activeSubflow?.nodeId) || null;
  }

  get isLoopBodyScope() {
    if (!this.activeSubflow || this.activeSubflow.branch !== 'body') {
      return false;
    }

    return this.activeSubflowNode?.type === 'forTimes'
      || this.activeSubflowNode?.type === 'while'
      || this.activeSubflowNode?.type === 'forEachElement'
      || this.activeSubflowNode?.type === 'forEachData';
  }

  get availableNodeTypes() {
    return NODE_TYPES.filter((nodeType) => nodeType.type !== 'break' || this.isLoopBodyScope);
  }

  get activeSubflowHint() {
    if (!this.activeSubflow) {
      return '拖拽节点到主画布中添加。';
    }

    if (this.isLoopBodyScope) {
      return '当前为循环 BODY，允许拖入退出循环节点。';
    }

    return '当前拖拽将投递到激活的子流程中。';
  }

  get canCopySelection() {
    return this.selectedNode !== null;
  }

  get canPasteSelection() {
    return (this.clipboard?.nodes.length || 0) > 0;
  }

  get canUndo() {
    return this.pastSnapshots.length > 0;
  }

  get canRedo() {
    return this.futureSnapshots.length > 0;
  }

  // ========== 数据加载 ==========

  // 加载模板
  async loadTemplate(id: string) {
    this.setLoading(true);
    this.setError(null);

    try {
      const response = await templateApi.get(id);
      const template = response.data;

      runInAction(() => {
        this.templateId = template.id;
        this.templateName = template.name;
        this.templateDescription = template.description;

        // 转换为 ReactFlow 格式
        const { nodes, edges } = stepsToGraph(template.steps, template.otherStep);
        this.rootNodes = cloneNodes(nodes);
        this.rootEdges = cloneEdges(edges);
        this.nodes = cloneNodes(nodes);
        this.edges = cloneEdges(edges);
        this.activeSubflow = null;
        this.subflowGraphMap = {};
        this.selectedNode = null;
        this.isDirty = false;
        this.clipboard = null;
        this.pastSnapshots = [];
        this.futureSnapshots = [];
      });

      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '加载模板失败');
      return false;
    } finally {
      this.setLoading(false);
    }
  }

  // 保存模板
  async saveTemplate(): Promise<boolean> {
    if (!this.templateId) return false;

    this.syncCurrentCanvas(false);

    // 转换数据
    const { steps, otherStep, error } = graphToSteps(this.rootNodes, this.rootEdges);
    if (error) {
      this.setError(error);
      return false;
    }

    this.setSaving(true);

    try {
      await templateApi.saveSteps(this.templateId, {
        schemaVersion: '0.0.6',
        steps: steps as Step[],
        otherStep
      });

      runInAction(() => {
        this.isDirty = false;
      });

      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '保存模板失败');
      return false;
    } finally {
      this.setSaving(false);
    }
  }

  // ========== 节点操作 ==========

  // 添加节点
  addNode(type: NodeType, position: XYPosition) {
    const nodeType = NODE_TYPES.find(n => n.type === type);
    if (!nodeType) return;

    if (type === 'break' && !this.isLoopBodyScope) {
      this.setError('退出循环节点只能添加到循环 BODY 中');
      return;
    }

    this.captureSnapshot();
    const newNode = createNewNode(type, position, nodeType.label);
    
    runInAction(() => {
      this.nodes = [...this.nodes, newNode];
      this.syncCurrentCanvas(false);
      this.selectedNode = newNode;
      this.isDirty = true;
    });

    return newNode;
  }

  // 更新节点数据
  updateNodeData(nodeId: string, data: Record<string, unknown>) {
    this.captureSnapshot();
    runInAction(() => {
      const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex !== -1) {
        const nextNodes = [...this.nodes];
        nextNodes[nodeIndex] = {
          ...nextNodes[nodeIndex],
          data: { ...nextNodes[nodeIndex].data, ...data }
        };
        this.nodes = nextNodes;
        this.syncCurrentCanvas(false);
        this.isDirty = true;
      }
    });
  }

  // 删除节点
  deleteNode(nodeId: string) {
    this.captureSnapshot();
    runInAction(() => {
      this.nodes = this.nodes.filter(n => n.id !== nodeId);
      this.edges = this.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
      
      if (this.selectedNode?.id === nodeId) {
        this.selectedNode = null;
      }
      
      this.syncCurrentCanvas(false);
      this.isDirty = true;
    });
  }

  // 设置选中节点
  setSelectedNode(node: Node | null) {
    this.selectedNode = node;
  }

  // 更新节点位置
  updateNodePosition(nodeId: string, position: XYPosition) {
    this.captureSnapshot();
    runInAction(() => {
      const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex !== -1) {
        const nextNodes = [...this.nodes];
        nextNodes[nodeIndex] = {
          ...nextNodes[nodeIndex],
          position,
        };
        this.nodes = nextNodes;
        this.syncCurrentCanvas(false);
        this.isDirty = true;
      }
    });
  }

  // ========== 连线操作 ==========

  // 添加连线（0.0.1 限制为线性流程）
  addEdge(connection: Connection, options?: { silent?: boolean }): boolean {
    const { source, target } = connection;

    if (!source || !target) return false;

    const silent = options?.silent ?? false;

    // 检查是否已存在从 source 出发的边（单出边限制）
    const existingSourceEdge = this.edges.find(e => e.source === source);
    if (existingSourceEdge) {
      if (!silent) {
        this.setError('每个节点只能有一个出边（线性流程限制）');
      }
      return false;
    }

    // 检查是否已存在指向 target 的边（单入边限制）
    const existingTargetEdge = this.edges.find(e => e.target === target);
    if (existingTargetEdge) {
      if (!silent) {
        this.setError('每个节点只能有一个入边（线性流程限制）');
      }
      return false;
    }

    // 检查是否形成自环
    if (source === target) {
      if (!silent) {
        this.setError('不能连接到自己');
      }
      return false;
    }

    this.captureSnapshot();
    runInAction(() => {
      const newEdge: Edge = {
        id: `edge-${source}-${target}`,
        source,
        target,
        type: 'smoothstep',
      };
      this.edges = [...this.edges, newEdge];
      this.syncCurrentCanvas(false);
      this.isDirty = true;
      if (!silent) {
        this.error = null;
      }
    });

    return true;
  }

  // 删除连线
  deleteEdge(edgeId: string) {
    this.captureSnapshot();
    runInAction(() => {
      this.edges = this.edges.filter(e => e.id !== edgeId);
      this.syncCurrentCanvas(false);
      this.isDirty = true;
    });
  }

  // ========== 画布操作 ==========

  // 设置整个画布数据
  setCanvas(nodes: Node[], edges: Edge[]) {
    this.captureSnapshot();
    this.nodes = cloneNodes(nodes);
    this.edges = cloneEdges(edges);
    this.syncCurrentCanvas(false);
    this.isDirty = true;
  }

  // 清空画布
  clearCanvas() {
    this.captureSnapshot();
    this.nodes = [];
    this.edges = [];
    this.selectedNode = null;
    this.syncCurrentCanvas(false);
    this.isDirty = true;
  }

  copySelection(): boolean {
    if (!this.selectedNode) {
      return false;
    }

    const selectedIds = new Set([this.selectedNode.id]);
    this.clipboard = {
      nodes: cloneNodes(this.nodes.filter((node) => selectedIds.has(node.id))),
      edges: cloneEdges(this.edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))),
    };
    return true;
  }

  cutSelection(): boolean {
    if (!this.copySelection() || !this.selectedNode) {
      return false;
    }

    this.deleteNode(this.selectedNode.id);
    return true;
  }

  pasteSelection(offset: XYPosition = { x: 48, y: 48 }): boolean {
    if (!this.clipboard || this.clipboard.nodes.length === 0) {
      return false;
    }

    this.captureSnapshot();
    const idMap = new Map<string, string>();
    const pastedNodes = this.clipboard.nodes.map((node) => {
      const nextId = generateId();
      idMap.set(node.id, nextId);
      return {
        ...node,
        id: nextId,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
        data: {
          ...node.data,
          label: `${node.data.label as string} 副本`,
          config: cloneConfig((node.data?.config as Record<string, unknown>) || {}),
        },
      } as Node;
    });

    const pastedEdges = this.clipboard.edges
      .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: `edge-${idMap.get(edge.source)}-${idMap.get(edge.target)}`,
        source: idMap.get(edge.source)!,
        target: idMap.get(edge.target)!,
      }));

    runInAction(() => {
      this.nodes = [...this.nodes, ...pastedNodes];
      this.edges = [...this.edges, ...pastedEdges];
      this.selectedNode = pastedNodes[pastedNodes.length - 1] || null;
      this.syncCurrentCanvas(false);
      this.isDirty = true;
      this.error = null;
    });

    return true;
  }

  undo(): boolean {
    if (!this.canUndo) {
      return false;
    }

    const snapshot = this.pastSnapshots.pop();
    if (!snapshot) {
      return false;
    }

    this.futureSnapshots.push(this.createSnapshot());
    this.restoreSnapshot(snapshot);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) {
      return false;
    }

    const snapshot = this.futureSnapshots.pop();
    if (!snapshot) {
      return false;
    }

    this.pastSnapshots.push(this.createSnapshot());
    this.restoreSnapshot(snapshot);
    return true;
  }

  enterSubflow(nodeId: string, branch: BranchType) {
    this.syncCurrentCanvas(false);
    const rootNode = this.rootNodes.find((node) => node.id === nodeId);
    if (!rootNode) {
      this.setError('未找到容器节点');
      return;
    }

    const graph = this.getOrCreateSubflowGraph(nodeId, branch, rootNode);
    this.activeSubflow = { nodeId, branch };
    this.nodes = cloneNodes(graph.nodes);
    this.edges = cloneEdges(graph.edges);
    this.selectedNode = null;
    this.error = null;
  }

  exitSubflow() {
    if (!this.activeSubflow) return;

    const rootNode = this.rootNodes.find((node) => node.id === this.activeSubflow?.nodeId) || null;
    this.syncCurrentCanvas(false);
    this.activeSubflow = null;
    this.nodes = cloneNodes(this.rootNodes);
    this.edges = cloneEdges(this.rootEdges);
    this.selectedNode = rootNode;
    this.error = null;
  }

  focusStepPath(stepPath: string[]): boolean {
    if (stepPath.length === 0) {
      return false;
    }

    this.syncCurrentCanvas(false);

    const rootNode = this.rootNodes.find((node) => node.id === stepPath[0]) || null;
    if (!rootNode) {
      this.setError('未找到失败节点对应的主流程节点');
      return false;
    }

    if (stepPath.length === 1 || !isBranchType(stepPath[1])) {
      runInAction(() => {
        this.activeSubflow = null;
        this.nodes = cloneNodes(this.rootNodes);
        this.edges = cloneEdges(this.rootEdges);
        this.selectedNode = this.nodes.find((node) => node.id === rootNode.id) || null;
        this.error = null;
      });
      return true;
    }

    const branch = stepPath[1];
    this.enterSubflow(rootNode.id, branch);

    const targetStepId = stepPath[2] || rootNode.id;
    const targetNode = this.nodes.find((node) => node.id === targetStepId) || null;

    runInAction(() => {
      this.selectedNode = targetNode;
    });

    if (!targetNode) {
      this.setError('已定位到失败分支，但未找到具体失败节点');
      return false;
    }

    this.setError(null);
    return true;
  }

  getSubflowCount(nodeId: string, branch: BranchType): number {
    const graph = this.subflowGraphMap[nodeId]?.[branch];
    if (graph) {
      return graphToSteps(graph.nodes, graph.edges).steps.length;
    }

    const rootNode = this.rootNodes.find((node) => node.id === nodeId);
    const branchSteps = rootNode?.data?.config?.[branch];
    return Array.isArray(branchSteps) ? branchSteps.length : 0;
  }

  getSubflowPreviewLabels(nodeId: string, branch: BranchType, maxCount: number = 3): string[] {
    const graph = this.subflowGraphMap[nodeId]?.[branch];
    if (graph) {
      const { steps } = graphToSteps(graph.nodes, graph.edges);
      return steps.map((step) => step.data.label).slice(0, maxCount);
    }

    const rootNode = this.rootNodes.find((node) => node.id === nodeId);
    const branchSteps = Array.isArray(rootNode?.data?.config?.[branch])
      ? rootNode?.data?.config?.[branch] as Step[]
      : [];
    return branchSteps.map((step) => step.data.label).slice(0, maxCount);
  }

  getActiveSubflowStepCount(): number {
    if (!this.activeSubflow) {
      return 0;
    }

    return this.getSubflowCount(this.activeSubflow.nodeId, this.activeSubflow.branch);
  }

  // ========== 运行相关 ==========

  // 验证画布是否可以运行
  validateForRun(): { valid: boolean; errors: string[]; warnings: string[] } {
    this.syncCurrentCanvas(false);
    const { steps } = graphToSteps(this.rootNodes, this.rootEdges);
    const result = validateCanvas(steps);
    
    return {
      valid: result.valid,
      errors: result.errors.map(e => `${e.stepLabel}: ${e.message}`),
      warnings: result.warnings
    };
  }

  // 设置运行状态
  setRunning(running: boolean) {
    this.isRunning = running;
  }

  setCurrentRunId(id: string | null) {
    this.currentRunId = id;
  }

  // ========== 状态设置器 ==========

  setLoading(loading: boolean) {
    this.loading = loading;
  }

  setSaving(saving: boolean) {
    this.saving = saving;
  }

  setError(error: string | null) {
    this.error = error;
  }

  setDirty(dirty: boolean) {
    this.isDirty = dirty;
  }

  private syncCurrentCanvas(markDirty: boolean) {
    if (!this.activeSubflow) {
      this.rootNodes = cloneNodes(this.nodes);
      this.rootEdges = cloneEdges(this.edges);
      if (markDirty) this.isDirty = true;
      return;
    }

    const { nodeId, branch } = this.activeSubflow;
    const graph: FlowGraph = {
      nodes: cloneNodes(this.nodes),
      edges: cloneEdges(this.edges),
    };

    if (!this.subflowGraphMap[nodeId]) {
      this.subflowGraphMap[nodeId] = {};
    }
    this.subflowGraphMap[nodeId][branch] = graph;

    const { steps, error } = graphToSteps(graph.nodes, graph.edges);
    if (!error) {
      const rootIndex = this.rootNodes.findIndex((node) => node.id === nodeId);
      if (rootIndex !== -1) {
        const rootNode = this.rootNodes[rootIndex];
        const nextConfig = {
          ...cloneConfig((rootNode.data?.config as Record<string, unknown>) || {}),
          [branch]: steps,
        };
        this.rootNodes[rootIndex] = {
          ...rootNode,
          data: {
            ...rootNode.data,
            config: nextConfig,
          },
        };
      }
    }

    if (markDirty) this.isDirty = true;
  }

  private getOrCreateSubflowGraph(nodeId: string, branch: BranchType, rootNode: Node): FlowGraph {
    const existing = this.subflowGraphMap[nodeId]?.[branch];
    if (existing) {
      return cloneGraph(existing);
    }

    const branchSteps = Array.isArray(rootNode.data?.config?.[branch])
      ? rootNode.data.config[branch] as Step[]
      : [];
    const graph = stepsToGraph(branchSteps, { nodes: [], edges: [] });

    if (!this.subflowGraphMap[nodeId]) {
      this.subflowGraphMap[nodeId] = {};
    }
    this.subflowGraphMap[nodeId][branch] = cloneGraph(graph);
    return graph;
  }

  private captureSnapshot() {
    const snapshot = this.createSnapshot();
    const previous = this.pastSnapshots[this.pastSnapshots.length - 1];
    if (previous && this.isSameSnapshot(previous, snapshot)) {
      return;
    }

    this.pastSnapshots.push(snapshot);
    if (this.pastSnapshots.length > 80) {
      this.pastSnapshots.shift();
    }
    this.futureSnapshots = [];
  }

  private createSnapshot(): EditorSnapshot {
    this.syncCurrentCanvas(false);
    return {
      rootNodes: cloneNodes(this.rootNodes),
      rootEdges: cloneEdges(this.rootEdges),
      subflowGraphMap: cloneSubflowGraphMap(this.subflowGraphMap),
      activeSubflow: this.activeSubflow ? { ...this.activeSubflow } : null,
      selectedNodeId: this.selectedNode?.id || null,
    };
  }

  private restoreSnapshot(snapshot: EditorSnapshot) {
    runInAction(() => {
      this.rootNodes = cloneNodes(snapshot.rootNodes);
      this.rootEdges = cloneEdges(snapshot.rootEdges);
      this.subflowGraphMap = cloneSubflowGraphMap(snapshot.subflowGraphMap);
      this.activeSubflow = snapshot.activeSubflow ? { ...snapshot.activeSubflow } : null;

      if (this.activeSubflow) {
        const graph = this.subflowGraphMap[this.activeSubflow.nodeId]?.[this.activeSubflow.branch];
        this.nodes = cloneNodes(graph?.nodes || []);
        this.edges = cloneEdges(graph?.edges || []);
      } else {
        this.nodes = cloneNodes(this.rootNodes);
        this.edges = cloneEdges(this.rootEdges);
      }

      this.selectedNode = snapshot.selectedNodeId
        ? this.nodes.find((node) => node.id === snapshot.selectedNodeId)
          || this.rootNodes.find((node) => node.id === snapshot.selectedNodeId)
          || null
        : null;
      this.isDirty = true;
      this.error = null;
    });
  }

  private isSameSnapshot(left: EditorSnapshot, right: EditorSnapshot): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}

// 导出单例
export const editorStore = new EditorStore();
