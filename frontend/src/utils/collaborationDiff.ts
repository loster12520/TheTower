import type { Edge, Node } from '@xyflow/react';

export interface CanvasDiffSummary {
  addedNodes: Array<{ id: string; label: string }>;
  removedNodes: Array<{ id: string; label: string }>;
  updatedNodes: Array<{ id: string; label: string }>;
  addedEdges: Array<{ id: string; label: string; source: string; target: string }>;
  removedEdges: Array<{ id: string; label: string; source: string; target: string }>;
  baseNodeCount: number;
  targetNodeCount: number;
  baseEdgeCount: number;
  targetEdgeCount: number;
  addedNodeLabels: string[];
  removedNodeLabels: string[];
  updatedNodeLabels: string[];
  addedEdgeCount: number;
  removedEdgeCount: number;
  totalChanges: number;
}

export interface CanvasDiffGuidance {
  level: 'warning' | 'info' | 'success';
  title: string;
  description: string;
}

const getNodeLabel = (node: Node): string => {
  const label = typeof node.data?.label === 'string' ? node.data.label : '';
  return label.trim().length > 0 ? label : node.id;
};

const getEdgeLabel = (edge: Edge, nodeMap: Map<string, Node>): string => {
  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);
  const sourceLabel = sourceNode ? getNodeLabel(sourceNode) : edge.source;
  const targetLabel = targetNode ? getNodeLabel(targetNode) : edge.target;
  return `${sourceLabel} -> ${targetLabel}`;
};

const toNodeFingerprint = (node: Node): string => JSON.stringify({
  type: node.type || null,
  label: node.data?.label || null,
  position: node.position,
  config: node.data?.config || null,
});

const formatLabelList = (labels: string[]): string => {
  if (labels.length === 0) {
    return '';
  }

  const visibleLabels = labels.slice(0, 3).join('、');
  return labels.length > 3
    ? `${visibleLabels} 等 ${labels.length} 项`
    : visibleLabels;
};

export const summarizeCanvasDiff = (
  baseNodes: Node[],
  baseEdges: Edge[],
  targetNodes: Node[],
  targetEdges: Edge[],
): CanvasDiffSummary => {
  const baseNodeMap = new Map(baseNodes.map((node) => [node.id, node]));
  const targetNodeMap = new Map(targetNodes.map((node) => [node.id, node]));
  const baseEdgeIds = new Set(baseEdges.map((edge) => edge.id));
  const targetEdgeIds = new Set(targetEdges.map((edge) => edge.id));

  const addedNodeLabels = targetNodes
    .filter((node) => !baseNodeMap.has(node.id))
    .map(getNodeLabel);
  const addedNodes = targetNodes
    .filter((node) => !baseNodeMap.has(node.id))
    .map((node) => ({ id: node.id, label: getNodeLabel(node) }));
  const removedNodeLabels = baseNodes
    .filter((node) => !targetNodeMap.has(node.id))
    .map(getNodeLabel);
  const removedNodes = baseNodes
    .filter((node) => !targetNodeMap.has(node.id))
    .map((node) => ({ id: node.id, label: getNodeLabel(node) }));
  const updatedNodeLabels = targetNodes
    .filter((node) => {
      const baseNode = baseNodeMap.get(node.id);
      return !!baseNode && toNodeFingerprint(baseNode) !== toNodeFingerprint(node);
    })
    .map(getNodeLabel);
  const updatedNodes = targetNodes
    .filter((node) => {
      const baseNode = baseNodeMap.get(node.id);
      return !!baseNode && toNodeFingerprint(baseNode) !== toNodeFingerprint(node);
    })
    .map((node) => ({ id: node.id, label: getNodeLabel(node) }));
  const addedEdges = targetEdges
    .filter((edge) => !baseEdgeIds.has(edge.id))
    .map((edge) => ({ id: edge.id, label: getEdgeLabel(edge, targetNodeMap), source: edge.source, target: edge.target }));
  const removedEdges = baseEdges
    .filter((edge) => !targetEdgeIds.has(edge.id))
    .map((edge) => ({ id: edge.id, label: getEdgeLabel(edge, baseNodeMap), source: edge.source, target: edge.target }));

  const addedEdgeCount = targetEdges.filter((edge) => !baseEdgeIds.has(edge.id)).length;
  const removedEdgeCount = baseEdges.filter((edge) => !targetEdgeIds.has(edge.id)).length;

  return {
    addedNodes,
    removedNodes,
    updatedNodes,
    addedEdges,
    removedEdges,
    baseNodeCount: baseNodes.length,
    targetNodeCount: targetNodes.length,
    baseEdgeCount: baseEdges.length,
    targetEdgeCount: targetEdges.length,
    addedNodeLabels,
    removedNodeLabels,
    updatedNodeLabels,
    addedEdgeCount,
    removedEdgeCount,
    totalChanges: addedNodeLabels.length + removedNodeLabels.length + updatedNodeLabels.length + addedEdgeCount + removedEdgeCount,
  };
};

export const formatCanvasDiffSummary = (title: string, summary: CanvasDiffSummary | null): string => {
  if (!summary) {
    return `${title}：正在分析差异...`;
  }

  const parts: string[] = [];
  if (summary.addedNodeLabels.length > 0) {
    parts.push(`新增节点 ${summary.addedNodeLabels.length} 个（${formatLabelList(summary.addedNodeLabels)}）`);
  }
  if (summary.removedNodeLabels.length > 0) {
    parts.push(`删除节点 ${summary.removedNodeLabels.length} 个（${formatLabelList(summary.removedNodeLabels)}）`);
  }
  if (summary.updatedNodeLabels.length > 0) {
    parts.push(`修改节点 ${summary.updatedNodeLabels.length} 个（${formatLabelList(summary.updatedNodeLabels)}）`);
  }
  if (summary.addedEdgeCount > 0 || summary.removedEdgeCount > 0) {
    parts.push(`连线变化 +${summary.addedEdgeCount} / -${summary.removedEdgeCount}`);
  }

  if (parts.length === 0) {
    parts.push('未检测到节点结构差异，可能主要是元数据变化');
  }

  return `${title}：${parts.join('；')}`;
};

export const getCanvasDiffGuidance = (summary: CanvasDiffSummary | null): CanvasDiffGuidance | null => {
  if (!summary || summary.totalChanges === 0) {
    return null;
  }

  if (summary.removedNodes.length > 0 || summary.removedEdges.length > 0) {
    return {
      level: 'warning',
      title: '建议优先处理远端删除项',
      description: '远端已删除的节点或连线更容易与本地画布残留状态冲突，通常应先确认删除项，再决定是否采纳新增或修改。',
    };
  }

  if (summary.updatedNodes.length > 0) {
    return {
      level: 'info',
      title: '建议先确认远端修改项',
      description: '远端修改通常会覆盖同一节点的配置，先确认修改项再处理新增内容，更容易判断最终应保留哪一份配置。',
    };
  }

  return {
    level: 'success',
    title: '当前以远端新增项为主',
    description: '本次远端差异主要是新增节点或连线，可以按需要逐项采纳，不必先做整页同步。',
  };
};