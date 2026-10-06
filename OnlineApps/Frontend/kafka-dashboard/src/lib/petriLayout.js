import dagre from '@dagrejs/dagre';
import { MarkerType } from '@xyflow/react';

export const NODE_DIMENSIONS = {
  place: { width: 52, height: 52 },
  transition: { width: 184, height: 62 },
};

/**
 * Computes an auto-layout for Petri Net nodes and edges using Dagre (Left-to-Right).
 *
 * @param {Array} rawNodes - Raw nodes from /api/model/master
 * @param {Array} rawEdges - Raw edges from /api/model/master
 * @param {'LR' | 'TB'} direction - Layout orientation
 * @returns {{ nodes: Array, edges: Array }} React Flow compatible elements
 */
export function layoutPetriNet(rawNodes, rawEdges, direction = 'LR') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 45,
    ranksep: 75,
    marginx: 48,
    marginy: 48,
  });

  // Register nodes with exact dimensions in Dagre
  rawNodes.forEach((node) => {
    const isPlace = node.type === 'place';
    const dim = isPlace ? NODE_DIMENSIONS.place : NODE_DIMENSIONS.transition;
    dagreGraph.setNode(node.id, { width: dim.width, height: dim.height });
  });

  // Register edges
  rawEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  // Map nodes to React Flow structure
  const nodes = rawNodes.map((node) => {
    const isPlace = node.type === 'place';
    const dim = isPlace ? NODE_DIMENSIONS.place : NODE_DIMENSIONS.transition;
    const pos = dagreGraph.node(node.id);

    return {
      id: node.id,
      type: isPlace ? 'placeNode' : 'transitionNode',
      position: {
        x: Math.round(pos.x - dim.width / 2),
        y: Math.round(pos.y - dim.height / 2),
      },
      targetPosition: direction === 'LR' ? 'left' : 'top',
      sourcePosition: direction === 'LR' ? 'right' : 'bottom',
      data: {
        ...node,
      },
    };
  });

  // Map edges to React Flow structure
  const edges = rawEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: 'var(--text-muted)',
    },
    style: {
      stroke: 'var(--text-muted)',
      strokeWidth: 1.75,
    },
  }));

  return { nodes, edges };
}
