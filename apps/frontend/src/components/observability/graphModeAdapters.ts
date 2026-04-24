import { Position, type Edge, type Node } from '@xyflow/react'
import type { GraphMode } from '../../store'

const FLOW_EDGE_TYPES = new Set(['FLOW_EVENT', 'TASK_HANDOFF'])

const appendClassName = (baseClass: string | undefined, nextClass: string) =>
  [baseClass, nextClass].filter(Boolean).join(' ')

const getPipelineLevels = (nodes: Node[], edges: Edge[]) => {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const indegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()
  const levels = new Map<string, number>()

  for (const node of nodes) {
    indegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    const neighbors = adjacency.get(edge.source)
    if (neighbors) neighbors.push(edge.target)
  }

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort((a, b) => a.localeCompare(b))

  for (const nodeId of queue) {
    levels.set(nodeId, 0)
  }

  let pointer = 0
  while (pointer < queue.length) {
    const currentId = queue[pointer]
    pointer += 1
    const currentLevel = levels.get(currentId) ?? 0
    const neighbors = adjacency.get(currentId) ?? []

    for (const neighborId of neighbors) {
      const nextLevel = Math.max(levels.get(neighborId) ?? 0, currentLevel + 1)
      levels.set(neighborId, nextLevel)
      indegree.set(neighborId, (indegree.get(neighborId) ?? 0) - 1)
      if ((indegree.get(neighborId) ?? 0) === 0) {
        queue.push(neighborId)
      }
    }
  }

  for (const node of nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0)
    }
  }

  return levels
}

export const adaptNodesForMode = (nodes: Node[], edges: Edge[], mode: GraphMode): Node[] => {
  if (mode === 'OBSERVABILITY') return nodes

  if (mode === 'PIPELINE') {
    const levels = getPipelineLevels(nodes, edges)
    const laneCounters = new Map<number, number>()
    const orderedNodes = [...nodes].sort((a, b) => {
      const levelA = levels.get(a.id) ?? 0
      const levelB = levels.get(b.id) ?? 0
      if (levelA !== levelB) return levelA - levelB
      return a.id.localeCompare(b.id)
    })

    const positionById = new Map<string, { x: number; y: number }>()
    for (const node of orderedNodes) {
      const level = levels.get(node.id) ?? 0
      const lane = laneCounters.get(level) ?? 0
      laneCounters.set(level, lane + 1)
      positionById.set(node.id, {
        x: 140 + level * 240,
        y: 80 + lane * 110,
      })
    }

    return nodes.map((node) => ({
      ...node,
      position: positionById.get(node.id) ?? node.position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: appendClassName(node.className, 'ov-node-pipeline'),
    }))
  }

  return nodes.map((node) => {
    const recent = Boolean((node.data as { recentlyActive?: boolean } | undefined)?.recentlyActive)
    return {
      ...node,
      className: appendClassName(
        appendClassName(node.className, 'ov-node-cinematic'),
        recent ? 'ov-node-cinematic-active' : ''
      ),
      style: {
        ...node.style,
        boxShadow: recent
          ? '0 0 0 8px rgba(0, 200, 255, 0.15)'
          : '0 0 0 2px rgba(34, 58, 94, 0.5)',
      },
    }
  })
}

export const adaptEdgesForMode = (edges: Edge[], mode: GraphMode): Edge[] => {
  if (mode === 'OBSERVABILITY') return edges

  if (mode === 'PIPELINE') {
    return edges.map((edge) => {
      const interactionType = String(edge.label ?? '')
      const flowDominant = FLOW_EDGE_TYPES.has(interactionType)
      return {
        ...edge,
        animated: flowDominant ? true : edge.animated,
        className: appendClassName(edge.className, flowDominant ? 'ov-edge-pipeline-flow' : ''),
        style: {
          ...edge.style,
          strokeWidth: flowDominant ? 3.4 : 1.4,
          opacity: flowDominant ? 1 : 0.7,
        },
      }
    })
  }

  return edges.map((edge) => ({
    ...edge,
    animated: true,
    className: appendClassName(edge.className, 'ov-edge-cinematic'),
    style: {
      ...edge.style,
      strokeWidth: 2.6,
      opacity: 0.9,
    },
  }))
}

