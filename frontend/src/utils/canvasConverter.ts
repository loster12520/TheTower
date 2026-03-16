import type { Node, Edge } from '@xyflow/react';
import type { Step, OtherStep } from '@/models';

/**
 * 画布数据转换器
 * 
 * 负责 ReactFlow 的 nodes/edges 与后端 steps 格式之间的相互转换
 * 0.0.1 版本仅支持线性流程（单入口单出口）
 */

interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

interface ConversionResult {
  steps: Step[];
  otherStep: OtherStep;
}

/**
 * 验证是否为线性流程
 * 规则：
 * 1. 只有一个起始节点（没有入边的节点）
 * 2. 每个节点最多一个出边
 * 3. 每个节点最多一个入边
 * 4. 无环
 */
function validateLinearFlow(nodes: Node[], edges: Edge[]): { valid: boolean; error?: string; startNodeId?: string } {
  if (nodes.length === 0) {
    return { valid: true }; // 空图视为有效
  }

  const nodeIds = new Set(nodes.map(n => n.id));
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  // 初始化
  nodes.forEach(node => {
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
    adjacencyList.set(node.id, []);
  });

  // 统计度数
  edges.forEach(edge => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return; // 忽略连接到不存在的节点的边
    }
    
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    adjacencyList.get(edge.source)?.push(edge.target);
  });

  // 检查每个节点最多一个出边和一个入边
  for (const [nodeId, count] of outDegree.entries()) {
    if (count > 1) {
      return { valid: false, error: `节点 "${nodeId}" 有多个出边，0.0.1 版本仅支持线性流程` };
    }
  }

  for (const [nodeId, count] of inDegree.entries()) {
    if (count > 1) {
      return { valid: false, error: `节点 "${nodeId}" 有多个入边，0.0.1 版本仅支持线性流程` };
    }
  }

  // 查找起始节点（没有入边的节点）
  const startNodes: string[] = [];
  for (const [nodeId, count] of inDegree.entries()) {
    if (count === 0) {
      startNodes.push(nodeId);
    }
  }

  if (startNodes.length === 0) {
    return { valid: false, error: '未找到起始节点，流程可能包含环路' };
  }

  if (startNodes.length > 1) {
    return { valid: false, error: `发现 ${startNodes.length} 个起始节点，0.0.1 版本仅支持单一路径` };
  }

  // 检测环路 - 使用 DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  if (hasCycle(startNodes[0])) {
    return { valid: false, error: '流程图中存在环路，0.0.1 版本仅支持线性流程' };
  }

  return { valid: true, startNodeId: startNodes[0] };
}

/**
 * 将 ReactFlow 的 nodes/edges 转换为后端的 steps 格式
 * 
 * 算法：
 * 1. 验证线性流程
 * 2. 从起始节点开始，沿出边遍历
 * 3. 遍历到的节点加入 steps
 * 4. 未遍历到的节点加入 otherStep.nodes
 */
export function graphToSteps(nodes: Node[], edges: Edge[]): ConversionResult & { error?: string } {
  // 验证线性流程
  const validation = validateLinearFlow(nodes, edges);
  if (!validation.valid) {
    return { steps: [], otherStep: { nodes: [], edges: [] }, error: validation.error };
  }

  if (nodes.length === 0) {
    return { steps: [], otherStep: { nodes: [], edges: [] } };
  }

  const startNodeId = validation.startNodeId!;
  
  // 构建邻接表
  const adjacencyList = new Map<string, string>();
  edges.forEach(edge => {
    adjacencyList.set(edge.source, edge.target);
  });

  // 沿路径遍历
  const stepNodeIds: string[] = [];
  let currentId: string | undefined = startNodeId;
  
  while (currentId) {
    stepNodeIds.push(currentId);
    currentId = adjacencyList.get(currentId);
  }

  // 构建 steps 数组
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const steps: Step[] = stepNodeIds.map(nodeId => {
    const node = nodeMap.get(nodeId)!;
    return {
      id: node.id,
      type: node.type as Step['type'],
      position: node.position,
      data: node.data as Step['data'],
    };
  });

  // 不在主路径上的节点和边
  const stepNodeIdSet = new Set(stepNodeIds);
  const otherNodes = nodes
    .filter(node => !stepNodeIdSet.has(node.id))
    .map(node => ({
      id: node.id,
      type: node.type as Step['type'],
      position: node.position,
      data: node.data as Step['data'],
    }));

  // 主路径上的边
  const mainPathEdges: Edge[] = [];
  for (let i = 0; i < stepNodeIds.length - 1; i++) {
    const edge = edges.find(e => e.source === stepNodeIds[i] && e.target === stepNodeIds[i + 1]);
    if (edge) {
      mainPathEdges.push(edge);
    }
  }

  // 不在主路径上的边
  const mainPathEdgeIdSet = new Set(mainPathEdges.map(e => e.id));
  const otherEdges = edges
    .filter(edge => !mainPathEdgeIdSet.has(edge.id))
    .map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    }));

  return {
    steps,
    otherStep: {
      nodes: otherNodes,
      edges: otherEdges,
    },
  };
}

/**
 * 将后端的 steps 格式转换为 ReactFlow 的 nodes/edges
 * 
 * 算法：
 * 1. steps 数组转换为 nodes
 * 2. steps 相邻节点之间创建 edges
 * 3. otherStep.nodes 和 otherStep.edges 直接转换
 */
export function stepsToGraph(steps: Step[], otherStep?: OtherStep | null): GraphData {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const otherNodes = Array.isArray(otherStep?.nodes) ? otherStep.nodes : [];
  const otherEdges = Array.isArray(otherStep?.edges) ? otherStep.edges : [];

  // 转换 steps 为 nodes
  steps.forEach((step, index) => {
    nodes.push({
      id: step.id,
      type: step.type,
      position: step.position,
      data: step.data,
    });

    // 创建与下一个节点的边
    if (index < steps.length - 1) {
      edges.push({
        id: `edge-${step.id}-${steps[index + 1].id}`,
        source: step.id,
        target: steps[index + 1].id,
        type: 'smoothstep',
      });
    }
  });

  // 转换 otherStep.nodes
  otherNodes.forEach(node => {
    nodes.push({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    });
  });

  // 转换 otherStep.edges
  otherEdges.forEach(edge => {
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
    });
  });

  return { nodes, edges };
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建新节点
 */
export function createNode(
  type: Step['type'],
  position: { x: number; y: number },
  label?: string
): Node {
  return {
    id: generateId(),
    type,
    position,
    data: {
      label: label || getDefaultLabel(type),
      config: getDefaultConfig(type),
    },
  };
}

/**
 * 获取节点类型的默认标签
 */
function getDefaultLabel(type: Step['type']): string {
  const labelMap: Record<Step['type'], string> = {
    openUrl: '打开网页',
    click: '点击元素',
    type: '输入文本',
    waitFor: '等待',
    extract: '提取数据',
    if: 'IF 条件',
    forTimes: 'For 次数',
    while: 'While 循环',
    break: '退出循环',
  };
  return labelMap[type];
}

/**
 * 获取节点类型的默认配置
 */
function getDefaultConfig(type: Step['type']): Record<string, unknown> {
  switch (type) {
    case 'openUrl':
      return { url: '' };
    case 'click':
      return { selector: '' };
    case 'type':
      return { selector: '', text: '' };
    case 'waitFor':
      return { selector: '', waitMs: undefined };
    case 'extract':
      return { selector: '', as: '', mode: 'text', attributeName: undefined };
    case 'if':
      return {
        condition: { left: '', op: 'exists', right: '' },
        then: [],
        else: [],
      };
    case 'forTimes':
      return { times: 1, indexVar: 'index', body: [] };
    case 'while':
      return {
        condition: { left: '', op: 'exists', right: '' },
        maxIterations: 10,
        body: [],
      };
    case 'break':
      return {};
    default:
      return {};
  }
}
