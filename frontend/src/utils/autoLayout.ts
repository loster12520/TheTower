import type { Edge, Node } from '@xyflow/react';

interface AutoLayoutResult {
  nodes: Node[];
  edges: Edge[];
}

const HORIZONTAL_GAP = 260;
const VERTICAL_GAP = 140;
const GROUP_OFFSET_Y = 180;
const START_X = 80;
const START_Y = 80;

const cloneNode = (node: Node): Node => ({
  ...node,
  position: { ...node.position },
});

const buildIncomingMap = (nodes: Node[], edges: Edge[]) => {
  const incoming = new Map<string, number>();
  nodes.forEach((node) => incoming.set(node.id, 0));
  edges.forEach((edge) => {
    if (incoming.has(edge.target)) {
      incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
    }
  });
  return incoming;
};

const buildOutgoingMap = (nodes: Node[], edges: Edge[]) => {
  const outgoing = new Map<string, string[]>();
  nodes.forEach((node) => outgoing.set(node.id, []));
  edges.forEach((edge) => {
    const list = outgoing.get(edge.source);
    if (list) {
      list.push(edge.target);
    }
  });
  return outgoing;
};

export const autoLayoutGraph = (nodes: Node[], edges: Edge[]): AutoLayoutResult => {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const nextNodes = nodes.map(cloneNode);
  const nodeMap = new Map(nextNodes.map((node) => [node.id, node]));
  const incoming = buildIncomingMap(nextNodes, edges);
  const outgoing = buildOutgoingMap(nextNodes, edges);
  const visited = new Set<string>();

  const roots = nextNodes
    .filter((node) => (incoming.get(node.id) || 0) === 0)
    .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);

  const queueRoots = roots.length > 0 ? roots : [...nextNodes].sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);
  let groupIndex = 0;

  const placeComponent = (rootId: string) => {
    let currentId: string | undefined = rootId;
    let column = 0;
    const rowY = START_Y + groupIndex * GROUP_OFFSET_Y;

    while (currentId && !visited.has(currentId)) {
      const node = nodeMap.get(currentId);
      if (!node) {
        break;
      }

      visited.add(currentId);
      node.position = {
        x: START_X + column * HORIZONTAL_GAP,
        y: rowY,
      };

      const nextTargets = (outgoing.get(currentId) || []).filter((targetId) => !visited.has(targetId));
      currentId = nextTargets[0];
      column += 1;
    }

    groupIndex += 1;
  };

  queueRoots.forEach((root) => {
    if (!visited.has(root.id)) {
      placeComponent(root.id);
    }
  });

  nextNodes
    .filter((node) => !visited.has(node.id))
    .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x)
    .forEach((node) => {
      placeComponent(node.id);
    });

  return {
    nodes: nextNodes,
    edges,
  };
};