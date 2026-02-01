import { makeAutoObservable, runInAction } from 'mobx';
import type { Node, Edge, Connection, XYPosition } from '@xyflow/react';
import { templateApi } from '@/services/api';
import { graphToSteps, stepsToGraph, createNode as createNewNode } from '@/utils/canvasConverter';
import { validateCanvas } from '@/utils/validator';
import type { WorkflowTemplate, ApiError, Step } from '@/models';

// 节点类型定义
export type NodeType = 'openUrl' | 'click' | 'type' | 'waitFor' | 'extract';

export const NODE_TYPES: { type: NodeType; label: string; color: string; icon: string }[] = [
  { type: 'openUrl', label: '打开网页', color: '#1890ff', icon: '🌐' },
  { type: 'click', label: '点击元素', color: '#52c41a', icon: '👆' },
  { type: 'type', label: '输入文本', color: '#faad14', icon: '⌨️' },
  { type: 'waitFor', label: '等待', color: '#722ed1', icon: '⏱️' },
  { type: 'extract', label: '提取数据', color: '#eb2f96', icon: '📋' },
];

class EditorStore {
  // 画布数据
  nodes: Node[] = [];
  edges: Edge[] = [];
  selectedNode: Node | null = null;

  // 模板信息
  templateId: string | null = null;
  templateName = '';
  templateDescription: string | null = null;

  // 状态
  loading = false;
  saving = false;
  isDirty = false;
  error: string | null = null;

  // 运行状态
  isRunning = false;
  currentRunId: string | null = null;

  constructor() {
    makeAutoObservable(this);
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
        this.nodes = nodes;
        this.edges = edges;
        this.isDirty = false;
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

    // 转换数据
    const { steps, otherStep, error } = graphToSteps(this.nodes, this.edges);
    if (error) {
      this.setError(error);
      return false;
    }

    this.setSaving(true);

    try {
      await templateApi.saveSteps(this.templateId, {
        schemaVersion: '0.0.1',
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

    const newNode = createNewNode(type, position, nodeType.label);
    
    runInAction(() => {
      this.nodes.push(newNode);
      this.isDirty = true;
    });

    return newNode;
  }

  // 更新节点数据
  updateNodeData(nodeId: string, data: Record<string, unknown>) {
    runInAction(() => {
      const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex !== -1) {
        this.nodes[nodeIndex] = {
          ...this.nodes[nodeIndex],
          data: { ...this.nodes[nodeIndex].data, ...data }
        };
        this.isDirty = true;
      }
    });
  }

  // 删除节点
  deleteNode(nodeId: string) {
    runInAction(() => {
      this.nodes = this.nodes.filter(n => n.id !== nodeId);
      this.edges = this.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
      
      if (this.selectedNode?.id === nodeId) {
        this.selectedNode = null;
      }
      
      this.isDirty = true;
    });
  }

  // 设置选中节点
  setSelectedNode(node: Node | null) {
    this.selectedNode = node;
  }

  // 更新节点位置
  updateNodePosition(nodeId: string, position: XYPosition) {
    runInAction(() => {
      const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex !== -1) {
        this.nodes[nodeIndex].position = position;
        this.isDirty = true;
      }
    });
  }

  // ========== 连线操作 ==========

  // 添加连线（0.0.1 限制为线性流程）
  addEdge(connection: Connection): boolean {
    const { source, target } = connection;

    if (!source || !target) return false;

    // 检查是否已存在从 source 出发的边（单出边限制）
    const existingSourceEdge = this.edges.find(e => e.source === source);
    if (existingSourceEdge) {
      this.setError('每个节点只能有一个出边（线性流程限制）');
      return false;
    }

    // 检查是否已存在指向 target 的边（单入边限制）
    const existingTargetEdge = this.edges.find(e => e.target === target);
    if (existingTargetEdge) {
      this.setError('每个节点只能有一个入边（线性流程限制）');
      return false;
    }

    // 检查是否形成自环
    if (source === target) {
      this.setError('不能连接到自己');
      return false;
    }

    runInAction(() => {
      const newEdge: Edge = {
        id: `edge-${source}-${target}`,
        source,
        target,
        type: 'smoothstep',
      };
      this.edges.push(newEdge);
      this.isDirty = true;
      this.error = null; // 清除错误
    });

    return true;
  }

  // 删除连线
  deleteEdge(edgeId: string) {
    runInAction(() => {
      this.edges = this.edges.filter(e => e.id !== edgeId);
      this.isDirty = true;
    });
  }

  // ========== 画布操作 ==========

  // 设置整个画布数据
  setCanvas(nodes: Node[], edges: Edge[]) {
    this.nodes = nodes;
    this.edges = edges;
    this.isDirty = true;
  }

  // 清空画布
  clearCanvas() {
    this.nodes = [];
    this.edges = [];
    this.selectedNode = null;
    this.isDirty = true;
  }

  // ========== 运行相关 ==========

  // 验证画布是否可以运行
  validateForRun(): { valid: boolean; errors: string[]; warnings: string[] } {
    const { steps } = graphToSteps(this.nodes, this.edges);
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
}

// 导出单例
export const editorStore = new EditorStore();
