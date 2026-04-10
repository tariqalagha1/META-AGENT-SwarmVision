import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import { ActiveHandoff, FlowAgent, FlowEdge } from './types'
import './SwarmFlowMap3D.css'

interface SwarmFlowMap3DProps {
  agents: Map<string, FlowAgent>
  edges: Map<string, FlowEdge>
  activeHandoffs: ActiveHandoff[]
  selectedAgentId?: string | null
  width?: number
  height?: number
  onNodeSelect?: (agentId: string | null) => void
  onNodeHover?: (agentId: string | null) => void
}

interface NodeRefs {
  coreMat: THREE.MeshPhongMaterial
  glowMat: THREE.MeshBasicMaterial
  pulseMesh: THREE.Mesh
  pulseMat: THREE.MeshBasicMaterial
  selectionRing: THREE.Mesh
  selectionMat: THREE.MeshBasicMaterial
}

interface GraphNode {
  id: string
  name: string
  state: FlowAgent['state']
  val: number
}

interface GraphLink {
  source: string
  target: string
  value: number
  isActive: boolean
  isSelected: boolean
}

interface CameraController {
  cameraPosition: (
    position?: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    transitionMs?: number
  ) => unknown
}

type ForceGraph3DComponentProps = {
  ref?: React.Ref<CameraController>
  graphData: {
    nodes: GraphNode[]
    links: GraphLink[]
  }
  width: number
  height: number
  backgroundColor: string
  nodeThreeObject: (node: GraphNode) => THREE.Object3D
  nodeThreeObjectExtend: boolean
  nodeLabel: (node: GraphNode) => string
  nodeOpacity: number
  nodeRelSize: number
  linkColor: (link: GraphLink) => string
  linkWidth: (link: GraphLink) => number
  linkOpacity: number
  linkCurvature: number
  linkDirectionalArrowLength: number
  linkDirectionalArrowRelPos: number
  linkDirectionalArrowColor: (link: GraphLink) => string
  linkDirectionalParticles: (link: GraphLink) => number
  linkDirectionalParticleWidth: number
  linkDirectionalParticleSpeed: number
  linkDirectionalParticleColor: () => string
  onNodeClick: (node: GraphNode) => void
  onNodeHover: (node: GraphNode | null) => void
  enableNodeDrag: boolean
  enableNavigationControls: boolean
  showNavInfo: boolean
  warmupTicks: number
  cooldownTicks: number
  d3VelocityDecay: number
  d3AlphaDecay: number
}

const ForceGraph3DComponent =
  ForceGraph3D as unknown as React.ComponentType<ForceGraph3DComponentProps>

const STATE_COLOR: Record<FlowAgent['state'], number> = {
  idle: 0x60a5fa,
  active: 0x06b6d4,
  working: 0xf59e0b,
  success: 0x10b981,
  failed: 0xef4444,
  terminated: 0x6b7280,
}

const STATE_EMISSIVE: Record<FlowAgent['state'], number> = {
  idle: 0.06,
  active: 0.4,
  working: 0.58,
  success: 0.42,
  failed: 0.48,
  terminated: 0,
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    return new THREE.Sprite()
  }

  ctx.fillStyle = 'rgba(6, 10, 22, 0.85)'
  const radius = 14
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(canvas.width - radius, 0)
  ctx.arcTo(canvas.width, 0, canvas.width, radius, radius)
  ctx.lineTo(canvas.width, canvas.height - radius)
  ctx.arcTo(canvas.width, canvas.height, canvas.width - radius, canvas.height, radius)
  ctx.lineTo(radius, canvas.height)
  ctx.arcTo(0, canvas.height, 0, canvas.height - radius, radius)
  ctx.lineTo(0, radius)
  ctx.arcTo(0, 0, radius, 0, radius)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif'
  ctx.fillStyle = '#e2e8f0'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text.slice(0, 12), canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(46, 13, 1)
  sprite.position.set(0, 24, 0)
  return sprite
}

export const SwarmFlowMap3D: React.FC<SwarmFlowMap3DProps> = ({
  agents,
  edges,
  activeHandoffs,
  selectedAgentId = null,
  width = 800,
  height = 600,
  onNodeSelect,
  onNodeHover,
}) => {
  const graphRef = useRef<CameraController | null>(null)
  const agentsRef = useRef(agents)
  const selectedRef = useRef(selectedAgentId)
  const nodeRefs = useRef<Map<string, NodeRefs>>(new Map())
  const introHasPlayedRef = useRef(false)

  useEffect(() => {
    agentsRef.current = agents
  }, [agents])

  useEffect(() => {
    selectedRef.current = selectedAgentId
  }, [selectedAgentId])

  const graphData = useMemo(
    () => ({
      nodes: Array.from(agents.values()).map((agent) => ({
        id: agent.id,
        name: agent.name,
        state: agent.state,
        val: Math.max(1, agent.tasks.length),
      })),
      links: Array.from(edges.values()).map((edge) => ({
        source: edge.source,
        target: edge.target,
        value: edge.count,
        isActive: activeHandoffs.some(
          (handoff) =>
            handoff.sourceId === edge.source && handoff.targetId === edge.target
        ),
        isSelected: Boolean(
          selectedAgentId &&
            (edge.source === selectedAgentId || edge.target === selectedAgentId)
        ),
      })),
    }),
    [activeHandoffs, agents, edges, selectedAgentId]
  )

  useEffect(() => {
    if (introHasPlayedRef.current || !graphRef.current) return

    introHasPlayedRef.current = true
    graphRef.current.cameraPosition({ x: 0, y: 0, z: 1400 })

    const timer = window.setTimeout(() => {
      graphRef.current?.cameraPosition(
        { x: 260, y: 180, z: 760 },
        { x: 0, y: 0, z: 0 },
        1800
      )
    }, 120)

    return () => window.clearTimeout(timer)
  }, [graphData.nodes.length])

  useEffect(() => {
    let frame = 0

    const tick = () => {
      const time = Date.now() * 0.001

      nodeRefs.current.forEach((refs, id) => {
        const agent = agentsRef.current.get(id)
        const state = agent?.state ?? 'idle'
        const color = STATE_COLOR[state]

        refs.coreMat.color.setHex(color)
        refs.coreMat.emissive.setHex(color)
        refs.coreMat.emissiveIntensity = STATE_EMISSIVE[state]

        refs.glowMat.color.setHex(color)
        switch (state) {
          case 'working':
            refs.glowMat.opacity = 0.12 + 0.11 * Math.abs(Math.sin(time * 3.6))
            break
          case 'active':
            refs.glowMat.opacity = 0.09 + 0.07 * Math.sin(time * 2)
            break
          case 'failed':
            refs.glowMat.opacity = 0.18 + 0.12 * Math.abs(Math.sin(time * 6))
            break
          case 'success':
            refs.glowMat.opacity = 0.13 + 0.06 * Math.sin(time * 1.3)
            break
          default:
            refs.glowMat.opacity = 0.05
        }

        refs.pulseMesh.visible = state === 'working'
        if (state === 'working') {
          const phase = (time * 1.6) % 1
          refs.pulseMesh.scale.setScalar(1 + phase)
          refs.pulseMat.opacity = 0.22 * (1 - phase)
          refs.pulseMat.color.setHex(color)
        }

        const isSelected = selectedRef.current === id
        refs.selectionRing.visible = isSelected
        if (isSelected) {
          const pulse = 1 + 0.06 * Math.sin(time * 5)
          refs.selectionRing.scale.setScalar(pulse)
          refs.selectionMat.opacity = 0.85 + 0.15 * Math.sin(time * 5)
        }
      })

      frame = requestAnimationFrame(tick)
    }

    tick()
    return () => cancelAnimationFrame(frame)
  }, [])

  const nodeThreeObject = useCallback((node: GraphNode) => {
    const size = 7 + Math.min(node.val, 10) * 0.5
    const color = STATE_COLOR[node.state]
    const group = new THREE.Group()

    const coreMat = new THREE.MeshPhongMaterial({
      color,
      emissive: color,
      emissiveIntensity: STATE_EMISSIVE[node.state],
      shininess: 90,
    })
    group.add(new THREE.Mesh(new THREE.SphereGeometry(size, 22, 22), coreMat))

    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    })
    group.add(new THREE.Mesh(new THREE.SphereGeometry(size * 1.7, 14, 14), glowMat))

    const pulseMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      wireframe: true,
      depthWrite: false,
    })
    const pulseMesh = new THREE.Mesh(
      new THREE.SphereGeometry(size * 2.4, 10, 10),
      pulseMat
    )
    pulseMesh.visible = node.state === 'working'
    group.add(pulseMesh)

    const selectionMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const selectionRing = new THREE.Mesh(
      new THREE.TorusGeometry(size * 2.1, 1.1, 8, 48),
      selectionMat
    )
    selectionRing.rotation.x = Math.PI / 2
    selectionRing.visible = node.id === selectedRef.current
    group.add(selectionRing)

    group.add(makeLabel(node.name))

    nodeRefs.current.set(node.id, {
      coreMat,
      glowMat,
      pulseMesh,
      pulseMat,
      selectionRing,
      selectionMat,
    })

    return group
  }, [])

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      onNodeSelect?.(selectedRef.current === node.id ? null : node.id)
    },
    [onNodeSelect]
  )

  const handleNodeHover = useCallback(
    (node: GraphNode | null) => {
      onNodeHover?.(node?.id ?? null)
    },
    [onNodeHover]
  )

  const getLinkColor = useCallback(
    (link: GraphLink) =>
      link.isSelected ? '#fbbf24' : link.isActive ? '#f59e0b' : '#2a3f5e',
    []
  )

  const getLinkWidth = useCallback(
    (link: GraphLink) => (link.isSelected ? 2.5 : link.isActive ? 1.8 : 0.6),
    []
  )

  const getParticleCount = useCallback(
    (link: GraphLink) => (link.isActive ? 6 : 0),
    []
  )

  const resetCamera = useCallback(() => {
    graphRef.current?.cameraPosition(
      { x: 260, y: 180, z: 760 },
      { x: 0, y: 0, z: 0 },
      900
    )
  }, [])

  return (
    <div className="sv3d-root">
      <div className="sv3d-hud-left">
        <button className="sv3d-btn" onClick={resetCamera}>
          Reset Camera
        </button>
        <div className="sv3d-stats">
          <span className="sv3d-stat">
            <span className="sv3d-dot cyan" />
            {graphData.nodes.length} agents
          </span>
          <span className="sv3d-stat">
            <span className="sv3d-dot slate" />
            {graphData.links.length} links
          </span>
          {activeHandoffs.length > 0 && (
            <span className="sv3d-stat sv3d-active">
              Active handoffs: {activeHandoffs.length}
            </span>
          )}
        </div>
      </div>

      <div className="sv3d-badge">3D CINEMATIC</div>

      <ForceGraph3DComponent
        ref={graphRef}
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor="#060c1a"
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        nodeLabel={(node) => `${node.name} [${node.state}]`}
        nodeOpacity={1}
        nodeRelSize={1}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkOpacity={0.85}
        linkCurvature={0.18}
        linkDirectionalArrowLength={5}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={getLinkColor}
        linkDirectionalParticles={getParticleCount}
        linkDirectionalParticleWidth={3}
        linkDirectionalParticleSpeed={0.007}
        linkDirectionalParticleColor={() => '#f59e0b'}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        enableNodeDrag={false}
        enableNavigationControls={true}
        showNavInfo={false}
        warmupTicks={60}
        cooldownTicks={200}
        d3VelocityDecay={0.28}
        d3AlphaDecay={0.015}
      />
    </div>
  )
}

export default SwarmFlowMap3D
