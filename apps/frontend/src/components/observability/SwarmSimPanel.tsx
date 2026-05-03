import { useCallback, useEffect, useRef, useState } from 'react'
import { useObservabilityStore } from '../../store'
import type { AgentState } from '../../store'
import './SwarmSimPanel.css'

// ─── Canvas constants ─────────────────────────────────────────────────────────

const TILE = 10
const COLS = 90
const ROWS = 42
const W = COLS * TILE   // 900
const H = ROWS * TILE   // 420

// ─── Palette ──────────────────────────────────────────────────────────────────

const P = {
  void:        '#03050C',
  hexDark:     '#060A16',
  hexMid:      '#091020',
  hexBorder:   '#0C1840',
  grid:        '#080F20',
  // zone themes
  cyan:        '#00FFEE',  cyanFill:   '#001520',  cyanGlow:   '#00BBCC',
  orange:      '#FF8800',  orangeFill: '#160800',  orangeGlow: '#BB5500',
  purple:      '#AA44FF',  purpleFill: '#0C0018',  purpleGlow: '#6600BB',
  // agents
  a0: '#00EEFF', a1: '#FFAA00', a2: '#44FF88', a3: '#FF88CC', aFail: '#FF3355',
  // conveyors
  belt:     '#08142A', beltEdge: '#003888', beltDash: '#0066CC',
  beltHitl: '#2A0010', beltRed:  '#FF2050', beltOrng: '#FF5500',
  // tokens / events
  tGold:  '#FFD700', tCyan: '#00FFCC', tRed: '#FF3355', tGreen: '#44FF88',
  tBlue:  '#4488FF', tPurp: '#BB44FF',
  // text
  txtBright: '#D0EEFF', txtMid: '#4080A0', txtDim: '#102840',
  labelBg:   '#01040A',
  scanline:  'rgba(0,10,30,0.20)',
  // HUD action colors
  actSpawn:  '#60FFCC', actTask:  '#00CFFF', actDone:  '#40FF90',
  actFail:   '#FF4060', actRoute: '#FFDC40', actMeta:  '#FFD060',
  actAudit:  '#80A0FF', actAnoma: '#FF2060',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Zone {
  id:     string
  label:  string
  x: number; y: number; w: number; h: number
  theme:  'cyan' | 'orange' | 'purple'
  slots:  number   // terminal workstation count
}

interface SimAgent {
  id:         string
  name:       string
  agentIndex: number
  zone:       string
  px: number; py: number
  targetX: number; targetY: number
  state:      'ACTIVE' | 'DEGRADED' | 'FAILED' | 'IDLE'
  pulse:      number
  lastEvent:  number
  lastAction: string    // short action label shown above head
  actionTs:   number    // when lastAction was set
  traceId:    string
  stepIndex:  number
  latency:    number    // ms, shown in HUD
  errorRate:  number
  throughput: number
}

interface LiveToken {
  id:       string
  sx: number; sy: number   // start px
  ex: number; ey: number   // end px
  progress: number         // 0..1
  speed:    number
  color:    string
  label:    string          // short event type
  age:      number
}

interface ZoneActivity {
  id:    string
  glow:  number   // 0..1 decays
  count: number
  lastEvType: string
}

interface BubbleMsg {
  agentId:  string
  text:     string
  color:    string
  born:     number    // Date.now()
  ttl:      number    // ms to live
}

interface LogEntry {
  ts:     number
  msg:    string
  color:  string
  agent:  string
}

interface Counters {
  processed: number; shipped: number; errors: number; insights: number
}

// ─── Zone layout ─────────────────────────────────────────────────────────────

const ZONES: Zone[] = [
  { id:'INTAKE',   label:'INTAKE',   x: 2,  y: 2,  w:19, h:14, theme:'cyan',   slots:3 },
  { id:'FORGE',    label:'FORGE',    x:23,  y: 2,  w:19, h:14, theme:'orange', slots:4 },
  { id:'QA_SCAN',  label:'QA SCAN',  x:44,  y: 2,  w:19, h:14, theme:'cyan',   slots:3 },
  { id:'ROUTER',   label:'ROUTER',   x:65,  y: 2,  w:22, h:14, theme:'orange', slots:2 },
  { id:'MEMORY',   label:'MEMORY',   x: 2,  y:22,  w:19, h:14, theme:'cyan',   slots:4 },
  { id:'DISPATCH', label:'DISPATCH', x:23,  y:22,  w:19, h:14, theme:'orange', slots:3 },
  { id:'AUDIT',    label:'AUDIT',    x:44,  y:22,  w:19, h:14, theme:'cyan',   slots:2 },
  { id:'HITL',     label:'HITL',     x:65,  y:22,  w:22, h:14, theme:'purple', slots:2 },
]
const ZONE_MAP: Record<string,Zone> = Object.fromEntries(ZONES.map(z=>[z.id,z]))

// Normal pipeline conveyors (no HITL — drawn separately)
const BELTS: Array<{from:string; to:string}> = [
  {from:'INTAKE',   to:'FORGE'},
  {from:'FORGE',    to:'QA_SCAN'},
  {from:'QA_SCAN',  to:'ROUTER'},
  {from:'ROUTER',   to:'DISPATCH'},
  {from:'DISPATCH', to:'MEMORY'},
  {from:'MEMORY',   to:'AUDIT'},
]

// ─── Event routing ────────────────────────────────────────────────────────────

const EVT_ZONE: Record<string,string> = {
  AGENT_SPAWN:       'INTAKE',
  AGENT_MOVE:        'ROUTER',
  AGENT_TERMINATION: 'AUDIT',
  TASK_START:        'FORGE',
  TASK_HANDOFF:      'ROUTER',
  TASK_SUCCESS:      'DISPATCH',
  TASK_FAIL:         'HITL',
  DECISION_POINT:    'ROUTER',
  DECISION:          'ROUTER',
  ANOMALY:           'HITL',
  META_INSIGHT:      'MEMORY',
  PIPELINE_UPDATE:   'DISPATCH',
  HEALTH_CHECK:      'AUDIT',
  SWARM_STARTED:     'INTAKE',
  SWARM_COMPLETE:    'DISPATCH',
  STEP_START:        'FORGE',
  STEP_COMPLETE:     'DISPATCH',
  STEP_FAILED:       'HITL',
  LLM_CALL:         'FORGE',
  TOOL_CALL:        'QA_SCAN',
  TOOL_RESULT:      'QA_SCAN',
  HANDOFF:          'ROUTER',
  RETRY:            'HITL',
}

const EVT_ABBR: Record<string,string> = {
  AGENT_SPAWN:'SPAWN', AGENT_MOVE:'MOVE', AGENT_TERMINATION:'TERM',
  TASK_START:'TASK',  TASK_HANDOFF:'HAND', TASK_SUCCESS:'DONE',
  TASK_FAIL:'FAIL',   DECISION_POINT:'DCSN', DECISION:'DCS',
  ANOMALY:'ANOM',     META_INSIGHT:'META', PIPELINE_UPDATE:'PIPE',
  HEALTH_CHECK:'HLTH', SWARM_STARTED:'RUN', SWARM_COMPLETE:'END',
  STEP_START:'STEP',  STEP_COMPLETE:'DONE', STEP_FAILED:'ERR',
  LLM_CALL:'LLM',     TOOL_CALL:'TOOL', TOOL_RESULT:'RSLT',
  HANDOFF:'HAND',     RETRY:'RTRY',
}

// Action label shown in speech bubble
const EVT_ACTION: Record<string,string> = {
  AGENT_SPAWN:    'spawning…',
  AGENT_MOVE:     'routing',
  AGENT_TERMINATION:'terminated',
  TASK_START:     'working…',
  TASK_HANDOFF:   'hand-off',
  TASK_SUCCESS:   '✓ done',
  TASK_FAIL:      '✗ failed',
  DECISION_POINT: 'deciding…',
  DECISION:       'decided',
  ANOMALY:        '⚠ anomaly',
  META_INSIGHT:   '💡 insight',
  PIPELINE_UPDATE:'updating',
  HEALTH_CHECK:   'health ok',
  SWARM_STARTED:  'swarm on',
  SWARM_COMPLETE: 'complete',
  STEP_START:     'step start',
  STEP_COMPLETE:  'step done',
  STEP_FAILED:    'step fail',
  LLM_CALL:       'calling LLM',
  TOOL_CALL:      'tool call',
  TOOL_RESULT:    'got result',
  HANDOFF:        'hand-off',
  RETRY:          'retrying…',
}

function evtTokenColor(t: string): string {
  if (t==='TASK_SUCCESS'||t==='TASK_HANDOFF'||t==='SWARM_COMPLETE'||t==='STEP_COMPLETE') return P.tGold
  if (t==='TASK_FAIL'||t==='ANOMALY'||t==='STEP_FAILED'||t==='RETRY')                   return P.tRed
  if (t==='META_INSIGHT')                                                                return P.tCyan
  if (t==='DECISION'||t==='DECISION_POINT')                                             return P.tPurp
  if (t==='LLM_CALL'||t==='TOOL_CALL'||t==='TOOL_RESULT')                              return P.tBlue
  return P.tGreen
}

function evtBubbleColor(t: string): string {
  if (t==='TASK_SUCCESS'||t==='STEP_COMPLETE'||t==='SWARM_COMPLETE') return P.actDone
  if (t==='TASK_FAIL'||t==='ANOMALY'||t==='STEP_FAILED')            return P.actFail
  if (t==='META_INSIGHT')                                            return P.actMeta
  if (t==='DECISION'||t==='DECISION_POINT')                         return P.actRoute
  if (t==='AGENT_SPAWN'||t==='SWARM_STARTED')                       return P.actSpawn
  if (t==='AUDIT'||t==='HEALTH_CHECK'||t==='AGENT_TERMINATION')     return P.actAudit
  if (t==='LLM_CALL'||t==='TOOL_CALL')                              return P.actTask
  return P.actTask
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function zoneCenter(z: Zone): {x:number; y:number} {
  return { x:(z.x+z.w/2)*TILE, y:(z.y+z.h/2)*TILE }
}

function randomInZone(z: Zone): {px:number; py:number} {
  return {
    px: (z.x + 2 + Math.random()*(z.w-4))*TILE,
    py: (z.y + 3 + Math.random()*(z.h-5))*TILE,
  }
}

function themeColors(t: Zone['theme']) {
  if (t==='orange') return { border:P.orange, fill:P.orangeFill, glow:P.orangeGlow }
  if (t==='purple') return { border:P.purple, fill:P.purpleFill, glow:P.purpleGlow }
  return { border:P.cyan, fill:P.cyanFill, glow:P.cyanGlow }
}

function agentColor(a: SimAgent): string {
  if (a.state==='FAILED') return P.aFail
  return [P.a0,P.a1,P.a2,P.a3][a.agentIndex%4]
}

// ─── Drawing functions ────────────────────────────────────────────────────────

function drawHex(ctx: CanvasRenderingContext2D, cx:number, cy:number, r:number,
  fill:string, stroke:string, lw:number): void {
  ctx.beginPath()
  for (let i=0;i<6;i++){
    const a=(Math.PI/3)*i, px=cx+r*Math.cos(a), py=cy+r*Math.sin(a)
    i===0?ctx.moveTo(px,py):ctx.lineTo(px,py)
  }
  ctx.closePath()
  ctx.fillStyle=fill; ctx.fill()
  ctx.strokeStyle=stroke; ctx.lineWidth=lw; ctx.stroke()
}

function drawHexTiles(ctx: CanvasRenderingContext2D, x0:number,y0:number,x1:number,y1:number,
  r:number, alpha:number): void {
  const hw=r*Math.sqrt(3), hh=r*2
  ctx.globalAlpha=alpha
  for(let row=0; row*hh*0.75<y1-y0; row++){
    for(let col=0; col*hw<x1-x0; col++){
      const cx=x0+col*hw+(row%2)*(hw/2)
      const cy=y0+row*hh*0.75
      drawHex(ctx,cx,cy,r,(col+row)%2===0?P.hexDark:P.hexMid,P.hexBorder,0.4)
    }
  }
  ctx.globalAlpha=1
}

function drawBelt(ctx: CanvasRenderingContext2D, fz:Zone, tz:Zone, dash:number,
  railColor:string, dashColor:string): void {
  const fc=zoneCenter(fz), tc=zoneCenter(tz)
  const dx=tc.x-fc.x, dy=tc.y-fc.y
  const len=Math.sqrt(dx*dx+dy*dy)
  if(len===0) return
  const px=-dy/len, py=dx/len, hw=TILE*0.6
  ctx.save()
  // Belt fill
  ctx.beginPath()
  ctx.moveTo(fc.x+px*hw, fc.y+py*hw)
  ctx.lineTo(tc.x+px*hw, tc.y+py*hw)
  ctx.lineTo(tc.x-px*hw, tc.y-py*hw)
  ctx.lineTo(fc.x-px*hw, fc.y-py*hw)
  ctx.closePath()
  ctx.fillStyle=railColor; ctx.fill()
  // Rail edges
  ctx.strokeStyle=P.beltEdge; ctx.lineWidth=1; ctx.setLineDash([])
  ctx.beginPath(); ctx.moveTo(fc.x+px*hw,fc.y+py*hw); ctx.lineTo(tc.x+px*hw,tc.y+py*hw); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(fc.x-px*hw,fc.y-py*hw); ctx.lineTo(tc.x-px*hw,tc.y-py*hw); ctx.stroke()
  // Animated dash
  ctx.strokeStyle=dashColor; ctx.lineWidth=2; ctx.setLineDash([5,7]); ctx.lineDashOffset=-dash
  ctx.beginPath(); ctx.moveTo(fc.x,fc.y); ctx.lineTo(tc.x,tc.y); ctx.stroke()
  ctx.setLineDash([]); ctx.lineDashOffset=0
  ctx.restore()
}

function drawLRoute(ctx: CanvasRenderingContext2D, pts:Array<[number,number]>,
  railColor:string, dashColor:string, dash:number): void {
  ctx.strokeStyle=railColor; ctx.lineWidth=2; ctx.setLineDash([])
  ctx.beginPath()
  pts.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y))
  ctx.stroke()
  ctx.strokeStyle=dashColor; ctx.lineWidth=1.5; ctx.setLineDash([4,6]); ctx.lineDashOffset=-dash
  ctx.beginPath()
  pts.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y))
  ctx.stroke()
  ctx.setLineDash([]); ctx.lineDashOffset=0
}

function drawZone(ctx: CanvasRenderingContext2D, zone:Zone, activity:ZoneActivity,
  zi:number, tick:number): void {
  const {border,fill,glow:gc}=themeColors(zone.theme)
  const zx=zone.x*TILE, zy=zone.y*TILE, zw=zone.w*TILE, zh=zone.h*TILE
  const g=activity.glow

  // Fill
  ctx.fillStyle=fill+'CC'; ctx.fillRect(zx,zy,zw,zh)

  // Clipped hex sub-tiles
  ctx.save()
  ctx.beginPath(); ctx.rect(zx,zy,zw,zh); ctx.clip()
  drawHexTiles(ctx,zx,zy,zx+zw,zy+zh,4,0.5)
  ctx.restore()

  // Workstation terminals
  for(let t=0;t<zone.slots;t++){
    const tx=((zi*11+t*7)%(zone.w-6)+2)*TILE+zx
    const ty=((zi*7+t*9)%(zone.h-7)+4)*TILE+zy
    ctx.fillStyle='#010509'; ctx.fillRect(tx,ty,TILE*3,TILE*2)
    ctx.strokeStyle=border+'88'; ctx.lineWidth=1; ctx.strokeRect(tx,ty,TILE*3,TILE*2)
    const p=0.55+0.45*Math.sin(tick*0.06+t+zi)
    ctx.globalAlpha=p; ctx.fillStyle=border; ctx.fillRect(tx+2,ty+2,TILE-4,TILE-4)
    ctx.globalAlpha=1
  }

  // Border glow
  if(g>0){ ctx.shadowBlur=18*g; ctx.shadowColor=gc }
  ctx.strokeStyle=g>0.3?border:border+'66'; ctx.lineWidth=2; ctx.strokeRect(zx,zy,zw,zh)
  ctx.shadowBlur=0

  // Corner brackets
  const bl=7; ctx.strokeStyle=border; ctx.lineWidth=1.5
  const cs:Array<[number,number,number,number]>=[[zx,zy,1,1],[zx+zw,zy,-1,1],[zx,zy+zh,1,-1],[zx+zw,zy+zh,-1,-1]]
  cs.forEach(([cx,cy,sx,sy])=>{
    ctx.beginPath(); ctx.moveTo(cx+sx*bl,cy); ctx.lineTo(cx,cy); ctx.lineTo(cx,cy+sy*bl); ctx.stroke()
  })

  // Label bar
  const bh=Math.floor(TILE*1.6)
  ctx.fillStyle=P.labelBg+'F0'; ctx.fillRect(zx,zy,zw,bh)
  ctx.fillStyle=border; ctx.fillRect(zx,zy,3,bh)
  ctx.font='bold 8px Courier New'; ctx.fillStyle=border
  ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.fillText(zone.label, zx+zw/2, zy+bh/2)

  // Event count badge
  if(activity.count>0){
    ctx.font='6px Courier New'; ctx.fillStyle=border+'AA'
    ctx.textAlign='right'; ctx.textBaseline='alphabetic'
    ctx.fillText(`×${activity.count}`, zx+zw-4, zy+bh-3)
  }

  // Activity flash
  if(g>0.05){
    const a=Math.floor(g*0.12*255).toString(16).padStart(2,'0')
    ctx.fillStyle=gc+a; ctx.fillRect(zx,zy,zw,zh)
  }

  ctx.textBaseline='alphabetic'
}

function drawToken(ctx: CanvasRenderingContext2D, tok:LiveToken): void {
  const x=tok.sx+(tok.ex-tok.sx)*tok.progress
  const y=tok.sy+(tok.ey-tok.sy)*tok.progress
  const fade=tok.progress>0.82?1-(tok.progress-0.82)/0.18:1
  // Trail
  for(let g=1;g<=3;g++){
    const tp=Math.max(0,tok.progress-g*0.04)
    const tx=tok.sx+(tok.ex-tok.sx)*tp, ty=tok.sy+(tok.ey-tok.sy)*tp
    ctx.globalAlpha=fade*(0.18-g*0.05)
    ctx.fillStyle=tok.color
    ctx.fillRect(tx-2,ty-2,4,4)
  }
  ctx.globalAlpha=fade
  ctx.save()
  ctx.translate(x,y); ctx.rotate(Math.PI/4)
  ctx.shadowBlur=10; ctx.shadowColor=tok.color
  ctx.fillStyle=tok.color; ctx.fillRect(-3.5,-3.5,7,7)
  ctx.restore()
  ctx.shadowBlur=0; ctx.globalAlpha=1
  // Label on token
  if(tok.progress>0.1&&tok.progress<0.85){
    ctx.font='5px Courier New'; ctx.fillStyle=tok.color
    ctx.textAlign='center'; ctx.textBaseline='alphabetic'
    ctx.globalAlpha=fade*0.9
    ctx.fillText(tok.label, x, y-7)
    ctx.globalAlpha=1
  }
  ctx.textBaseline='alphabetic'
}

function drawAgent(ctx: CanvasRenderingContext2D, a: SimAgent): void {
  const col=agentColor(a)
  const ps=1+Math.sin(a.pulse)*0.15

  // Shadow halo
  ctx.beginPath(); ctx.arc(a.px,a.py,7*ps,0,Math.PI*2)
  ctx.fillStyle=col+'30'; ctx.fill()

  // Legs
  ctx.fillStyle=col+'CC'
  ctx.fillRect(a.px-3,a.py+3,2,5); ctx.fillRect(a.px+1,a.py+3,2,5)

  // Torso
  ctx.fillStyle=col+'BB'; ctx.fillRect(a.px-2,a.py-2,4,5)

  // Arms
  ctx.fillStyle=col+'99'
  ctx.fillRect(a.px-4,a.py-1,2,3); ctx.fillRect(a.px+2,a.py-1,2,3)

  // Head glow
  ctx.shadowBlur=a.state==='ACTIVE'?10:a.state==='DEGRADED'?6:2
  ctx.shadowColor=col
  ctx.beginPath(); ctx.arc(a.px,a.py-4,3,0,Math.PI*2)
  ctx.fillStyle=col; ctx.fill()
  ctx.shadowBlur=0

  // State ring for DEGRADED/FAILED
  if(a.state==='DEGRADED'||a.state==='FAILED'){
    ctx.beginPath(); ctx.arc(a.px,a.py-4,5,0,Math.PI*2)
    ctx.strokeStyle=col; ctx.lineWidth=1; ctx.stroke()
  }
}

function drawAgentHUD(ctx: CanvasRenderingContext2D, a: SimAgent, now: number): void {
  const col=agentColor(a)
  const age=now-a.lastEvent
  if(age>4000) return

  // Fade out after 3s
  const alpha=age>3000?1-(age-3000)/1000:1
  ctx.globalAlpha=alpha

  const W_HUD=68, H_HUD=28
  const hx=a.px-W_HUD/2, hy=a.py-H_HUD-14
  ctx.fillStyle=P.labelBg+'EE'; ctx.fillRect(hx,hy,W_HUD,H_HUD)
  ctx.strokeStyle=col+'CC'; ctx.lineWidth=1; ctx.strokeRect(hx,hy,W_HUD,H_HUD)
  // left accent bar
  ctx.fillStyle=col; ctx.fillRect(hx,hy,2,H_HUD)

  ctx.font='bold 6px Courier New'; ctx.fillStyle=col
  ctx.textAlign='left'; ctx.textBaseline='alphabetic'
  ctx.fillText(a.name.slice(0,10), hx+5, hy+9)

  // Action line
  ctx.font='5px Courier New'; ctx.fillStyle=P.txtBright
  ctx.fillText(a.lastAction||a.state, hx+5, hy+18)

  // Metrics line
  if(a.latency>0){
    ctx.font='4px Courier New'; ctx.fillStyle=P.txtMid
    ctx.fillText(`${a.latency}ms`, hx+5, hy+25)
  }

  // Latency bar
  if(a.latency>0){
    const barW=W_HUD-10, bx=hx+5, by=hy+H_HUD-3
    const fill=Math.min(1,a.latency/2000)
    const barColor=fill>0.7?P.aFail:fill>0.4?P.a1:P.actDone
    ctx.fillStyle=P.txtDim+'60'; ctx.fillRect(bx,by-2,barW,2)
    ctx.fillStyle=barColor; ctx.fillRect(bx,by-2,barW*fill,2)
  }

  ctx.globalAlpha=1
  ctx.textBaseline='alphabetic'
}

function drawBubble(ctx: CanvasRenderingContext2D, b: BubbleMsg,
  agents: Map<string,SimAgent>, now: number): void {
  const a=agents.get(b.agentId)
  if(!a) return
  const age=now-b.born
  if(age>b.ttl) return
  const fade=age>b.ttl*0.7?1-(age-b.ttl*0.7)/(b.ttl*0.3):1
  ctx.globalAlpha=fade*0.95

  ctx.font='5px Courier New'
  const tw=ctx.measureText(b.text).width
  const bw=tw+8, bh=10
  const bx=a.px-bw/2, by=a.py-24

  ctx.fillStyle=P.labelBg+'DD'; ctx.fillRect(bx,by,bw,bh)
  ctx.strokeStyle=b.color+'BB'; ctx.lineWidth=0.5; ctx.strokeRect(bx,by,bw,bh)
  ctx.fillStyle=b.color; ctx.textAlign='left'; ctx.textBaseline='alphabetic'
  ctx.fillText(b.text, bx+4, by+bh-2)

  // Tail
  ctx.fillStyle=b.color+'BB'
  ctx.beginPath(); ctx.moveTo(a.px-2,by+bh); ctx.lineTo(a.px+2,by+bh); ctx.lineTo(a.px,by+bh+4); ctx.closePath(); ctx.fill()

  ctx.globalAlpha=1; ctx.textBaseline='alphabetic'
}

function drawStatusBar(ctx: CanvasRenderingContext2D, ctr: Counters,
  agents: Map<string,SimAgent>, tick: number): void {
  const by=H-30
  ctx.fillStyle='#01030AEE'; ctx.fillRect(0,by,W,30)
  ctx.strokeStyle='rgba(0,200,220,0.15)'; ctx.lineWidth=1
  ctx.beginPath(); ctx.moveTo(0,by); ctx.lineTo(W,by); ctx.stroke()

  const stats=[
    {l:'PROCESSED',v:ctr.processed,c:P.cyan},
    {l:'SHIPPED',  v:ctr.shipped,  c:P.actDone},
    {l:'ERRORS',   v:ctr.errors,   c:P.aFail},
    {l:'INSIGHTS', v:ctr.insights, c:P.actMeta},
    {l:'AGENTS',   v:agents.size,  c:P.a0},
  ]
  stats.forEach((s,i)=>{
    const x=10+i*115
    ctx.font='5px Courier New'; ctx.fillStyle=P.txtDim
    ctx.textAlign='left'; ctx.textBaseline='alphabetic'
    ctx.fillText(s.l,x,by+11)
    ctx.font='bold 11px Courier New'; ctx.fillStyle=s.c
    ctx.fillText(String(s.v),x,by+25)
  })

  // Live pulse
  const lp=0.4+0.6*Math.sin(tick*0.1)
  ctx.beginPath(); ctx.arc(W-112,by+15,3,0,Math.PI*2)
  ctx.fillStyle=`rgba(68,255,136,${lp})`; ctx.fill()
  ctx.shadowBlur=6; ctx.shadowColor='#44FF88'
  ctx.beginPath(); ctx.arc(W-112,by+15,3,0,Math.PI*2)
  ctx.fillStyle=`rgba(68,255,136,${lp})`; ctx.fill()
  ctx.shadowBlur=0

  ctx.font='bold 7px Courier New'; ctx.fillStyle='#44FF88'
  ctx.textAlign='left'
  ctx.fillText('LIVE', W-105, by+19)
  ctx.fillStyle=P.txtDim
  ctx.fillText('SWARM ORCHESTRATION', W-80, by+19)
}

function drawScanlines(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle=P.scanline
  for(let sy=0;sy<H;sy+=3){ ctx.fillRect(0,sy,W,1) }
}

function drawNameTag(ctx: CanvasRenderingContext2D, a: SimAgent, settled: boolean): void {
  if(!settled) return
  const col=agentColor(a)
  const offsetY=-9-(a.agentIndex%3)*7
  ctx.font='5px Courier New'; ctx.fillStyle=col+'CC'
  ctx.textAlign='center'; ctx.textBaseline='alphabetic'
  ctx.fillText(a.name.slice(0,9), a.px, a.py+offsetY)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SwarmSimPanel(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)

  const sim = useRef({
    agents:      new Map<string,SimAgent>(),
    tokens:      [] as LiveToken[],
    bubbles:     [] as BubbleMsg[],
    zones:       new Map<string,ZoneActivity>(
      ZONES.map(z=>[z.id,{id:z.id,glow:0,count:0,lastEvType:''}])
    ),
    log:         [] as LogEntry[],
    counters:    {processed:0,shipped:0,errors:0,insights:0} as Counters,
    dashOffset:  0,
    tick:        0,
    speed:       1 as number,
    agentIdx:    0,
    lastEvId:    '',
    // selected agent for click-through
    selected:    null as string|null,
  })

  const [speed,      setSpeed]      = useState<1|2|5>(1)
  const [counters,   setCounters]   = useState<Counters>({processed:0,shipped:0,errors:0,insights:0})
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [collapsed,  setCollapsed]  = useState(false)
  const [selectedId, setSelectedId] = useState<string|null>(null)

  // Zustand selectors
  const events      = useObservabilityStore(s=>s.events)
  const eventOrder  = useObservabilityStore(s=>s.eventOrder)
  const storeAgents = useObservabilityStore(s=>s.agents)

  // ── Sync AgentState from store ─────────────────────────────────────────────
  useEffect(()=>{
    const s=sim.current
    Object.values(storeAgents).forEach((sa:AgentState)=>{
      const ex=s.agents.get(sa.agent_id)
      if(!ex){
        const zone=ZONE_MAP['INTAKE']??ZONES[0]
        const {px,py}=randomInZone(zone)
        s.agents.set(sa.agent_id,{
          id:sa.agent_id, name:sa.agent_id.slice(0,10),
          agentIndex:s.agentIdx++, zone:zone.id,
          px,py, targetX:px, targetY:py,
          state:sa.state==='DEGRADED'?'DEGRADED':sa.state==='FAILED'?'FAILED':'ACTIVE',
          pulse:Math.random()*Math.PI*2, lastEvent:Date.now(),
          lastAction:'', actionTs:0, traceId:'',
          stepIndex:0, latency:sa.latency_avg??0,
          errorRate:sa.error_rate??0, throughput:sa.throughput??0,
        })
      } else {
        ex.state=sa.state==='DEGRADED'?'DEGRADED':sa.state==='FAILED'?'FAILED':'ACTIVE'
        ex.latency=sa.latency_avg??ex.latency
        ex.errorRate=sa.error_rate??ex.errorRate
        ex.throughput=sa.throughput??ex.throughput
      }
    })
  },[storeAgents])

  // ── Process live events ────────────────────────────────────────────────────
  useEffect(()=>{
    if(!eventOrder.length) return
    const s=sim.current
    if(eventOrder[0]===s.lastEvId) return
    s.lastEvId=eventOrder[0]

    // Process up to 8 newest events (more than before for better liveness)
    eventOrder.slice(0,8).forEach(eid=>{
      const ev=events[eid]
      if(!ev) return
      const evRaw=ev as unknown as Record<string,unknown>
      const evType=String(ev.event_type??evRaw['type']??'')
      const agentId=String(ev.agent_id??'')
      const traceId=String(ev.trace_id??'')
      const stepIdx=Number(ev.step_index??0)
      const latMs=Number(ev.latency_ms??0)
      const zoneId=EVT_ZONE[evType]

      // Counters
      s.counters.processed++
      if(evType==='TASK_SUCCESS'||evType==='TASK_HANDOFF'||
         evType==='STEP_COMPLETE'||evType==='SWARM_COMPLETE') s.counters.shipped++
      if(evType==='TASK_FAIL'||evType==='ANOMALY'||
         evType==='STEP_FAILED'||evType==='RETRY')            s.counters.errors++
      if(evType==='META_INSIGHT')                             s.counters.insights++

      // Zone activation
      if(zoneId){
        const za=s.zones.get(zoneId)
        if(za){ za.glow=1.0; za.count++; za.lastEvType=evType }
      }

      // Agent update / creation
      if(agentId&&zoneId){
        const zone=ZONE_MAP[zoneId]
        if(zone){
          if(!s.agents.has(agentId)){
            const {px,py}=randomInZone(zone)
            s.agents.set(agentId,{
              id:agentId, name:agentId.slice(0,10),
              agentIndex:s.agentIdx++, zone:zoneId,
              px,py, targetX:px, targetY:py,
              state:'ACTIVE', pulse:Math.random()*Math.PI*2,
              lastEvent:Date.now(), lastAction:EVT_ACTION[evType]??evType,
              actionTs:Date.now(), traceId, stepIndex:stepIdx,
              latency:latMs, errorRate:0, throughput:0,
            })
          }
          const ag=s.agents.get(agentId)!
          // Move agent to new zone
          if(ag.zone!==zoneId){
            const {px:tx,py:ty}=randomInZone(zone)
            ag.targetX=tx; ag.targetY=ty; ag.zone=zoneId
          }
          ag.lastEvent=Date.now()
          ag.lastAction=EVT_ACTION[evType]??evType
          ag.actionTs=Date.now()
          ag.traceId=traceId
          ag.stepIndex=stepIdx
          if(latMs>0) ag.latency=latMs
          // State machine
          if(evType==='TASK_FAIL'||evType==='ANOMALY'||evType==='STEP_FAILED'||evType==='RETRY')
            ag.state='DEGRADED'
          else if(evType==='AGENT_TERMINATION') ag.state='FAILED'
          else if(evType==='AGENT_SPAWN'||evType==='SWARM_STARTED') ag.state='ACTIVE'
          else if(evType==='TASK_SUCCESS'||evType==='STEP_COMPLETE') ag.state='ACTIVE'

          // Speech bubble
          const action=EVT_ACTION[evType]
          if(action){
            const col=evtBubbleColor(evType)
            // replace existing bubble for this agent
            s.bubbles=s.bubbles.filter(b=>b.agentId!==agentId)
            s.bubbles.push({agentId,text:action,color:col,born:Date.now(),ttl:2800})
          }
        }
      }

      // Token spawn — travel along the conveyor toward the destination zone
      if(zoneId){
        const toZone=ZONE_MAP[zoneId]
        const belt=BELTS.find(b=>b.to===zoneId)
        const fromZoneId=belt?belt.from:(zoneId==='HITL'?'ROUTER':zoneId==='FORGE'&&!belt?'HITL':null)
        const fromZone=fromZoneId?ZONE_MAP[fromZoneId]:null
        if(fromZone&&toZone){
          const fc=zoneCenter(fromZone), tc=zoneCenter(toZone)
          s.tokens.push({
            id:eid,
            sx:fc.x,sy:fc.y,ex:tc.x,ey:tc.y,
            progress:0,
            speed:0.005+Math.random()*0.007,
            color:evtTokenColor(evType),
            label:EVT_ABBR[evType]??evType.slice(0,4),
            age:0,
          })
        }
      }

      // Log
      const abbr=EVT_ABBR[evType]??evType.slice(0,5)
      const who=agentId?agentId.slice(0,10):'system'
      s.log.unshift({ts:Date.now(),msg:`${abbr} · ${who}`,color:evtBubbleColor(evType),agent:agentId})
      if(s.log.length>24) s.log.length=24
    })
  },[eventOrder,events])

  // ── Demo agents on mount ───────────────────────────────────────────────────
  useEffect(()=>{
    const s=sim.current
    if(s.agents.size>0) return
    const seeds:Array<[string,string,string]>=[
      ['forge-01','FORGE','working…'],
      ['qa-01','QA_SCAN','scanning'],
      ['router-01','ROUTER','routing'],
      ['dispatch-01','DISPATCH','dispatching'],
      ['memory-01','MEMORY','indexing'],
    ]
    seeds.forEach(([id,zid,action])=>{
      const zone=ZONE_MAP[zid]; if(!zone) return
      const {px,py}=randomInZone(zone)
      s.agents.set(id,{
        id, name:id, agentIndex:s.agentIdx++, zone:zid,
        px,py, targetX:px, targetY:py, state:'ACTIVE',
        pulse:Math.random()*Math.PI*2, lastEvent:Date.now()-4000,
        lastAction:action, actionTs:Date.now()-4000,
        traceId:'', stepIndex:0, latency:0, errorRate:0, throughput:0,
      })
    })
  },[])

  // ── Flush to React state 400ms ─────────────────────────────────────────────
  useEffect(()=>{
    const iv=setInterval(()=>{
      const s=sim.current
      setCounters({...s.counters})
      setLogEntries([...s.log.slice(0,14)])
      setSelectedId(s.selected)
    },400)
    return ()=>clearInterval(iv)
  },[])

  // ── Speed sync ─────────────────────────────────────────────────────────────
  useEffect(()=>{ sim.current.speed=speed },[speed])

  // ── Canvas click — select agent ────────────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>)=>{
    const canvas=canvasRef.current; if(!canvas) return
    const rect=canvas.getBoundingClientRect()
    const scaleX=W/rect.width, scaleY=H/rect.height
    const mx=(e.clientX-rect.left)*scaleX
    const my=(e.clientY-rect.top)*scaleY
    const s=sim.current
    let hit: string|null=null
    s.agents.forEach(a=>{
      const dx=a.px-mx, dy=a.py-my
      if(dx*dx+dy*dy<144) hit=a.id  // 12px radius
    })
    s.selected=hit
  },[])

  // ── Animation loop ─────────────────────────────────────────────────────────
  const draw = useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas) return
    const ctx=canvas.getContext('2d'); if(!ctx) return
    const s=sim.current
    const spd=s.speed
    const now=Date.now()
    s.tick++
    s.dashOffset=(s.dashOffset+0.5*spd)%80

    // 1. Background void
    ctx.fillStyle=P.void; ctx.fillRect(0,0,W,H)

    // 2. Ambient grid lines
    ctx.strokeStyle=P.grid; ctx.lineWidth=0.25
    for(let gx=0;gx<=W;gx+=TILE*4){
      ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,H); ctx.stroke()
    }
    for(let gy=0;gy<=H;gy+=TILE*4){
      ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(W,gy); ctx.stroke()
    }

    // 3. Hex floor tiles (full canvas, light)
    drawHexTiles(ctx,0,0,W,H,6,0.85)

    // 4. Normal conveyor belts
    BELTS.forEach(b=>{
      const fz=ZONE_MAP[b.from],tz=ZONE_MAP[b.to]
      if(fz&&tz) drawBelt(ctx,fz,tz,s.dashOffset,P.belt,P.beltDash)
    })

    // 5. HITL feedback loop — L-shaped paths
    {
      const router=ZONE_MAP['ROUTER'], hitl=ZONE_MAP['HITL'], forge=ZONE_MAP['FORGE']
      if(router&&hitl&&forge){
        const rc=zoneCenter(router), hc=zoneCenter(hitl), fc=zoneCenter(forge)
        const rx=(hitl.x+hitl.w)*TILE+12, rx2=rx+10, botY=H-34
        drawLRoute(ctx,
          [[rc.x,rc.y],[rx,rc.y],[rx,hc.y],[hc.x,hc.y]],
          P.beltHitl, P.beltOrng, s.dashOffset
        )
        drawLRoute(ctx,
          [[hc.x,hc.y],[rx2,hc.y],[rx2,botY],[fc.x,botY],[fc.x,fc.y]],
          P.beltHitl, P.beltRed, s.dashOffset
        )
      }
    }

    // 6. Zones
    ZONES.forEach((zone,zi)=>{
      const za=s.zones.get(zone.id); if(!za) return
      za.glow=Math.max(0,za.glow-0.010*spd)
      drawZone(ctx,zone,za,zi,s.tick)
    })

    // 7. Tokens
    s.tokens=s.tokens.filter(t=>t.progress<1&&t.age<220)
    s.tokens.forEach(t=>{
      t.progress=Math.min(1,t.progress+t.speed*spd)
      t.age++
      drawToken(ctx,t)
    })

    // 8. Agents — move + draw
    s.agents.forEach(a=>{
      a.pulse+=0.05*spd
      const dx=a.targetX-a.px, dy=a.targetY-a.py
      const dist=Math.sqrt(dx*dx+dy*dy)
      if(dist>1.5){
        a.px+=(dx/dist)*Math.min(dist,1.0*spd)
        a.py+=(dy/dist)*Math.min(dist,1.0*spd)
      } else if(Math.random()<0.004*spd){
        const zone=ZONE_MAP[a.zone]
        if(zone){ const {px,py}=randomInZone(zone); a.targetX=px; a.targetY=py }
      }
      drawAgent(ctx,a)

      // Name tag when settled
      const settled=dx*dx+dy*dy<100
      drawNameTag(ctx,a,settled)

      // Selection ring
      if(s.selected===a.id){
        const col=agentColor(a)
        ctx.strokeStyle=col; ctx.lineWidth=1.5
        ctx.setLineDash([3,3]); ctx.lineDashOffset=-s.dashOffset*0.5
        ctx.beginPath(); ctx.arc(a.px,a.py,10,0,Math.PI*2); ctx.stroke()
        ctx.setLineDash([]); ctx.lineDashOffset=0
      }
    })

    // 9. Speech bubbles
    s.bubbles=s.bubbles.filter(b=>now-b.born<b.ttl)
    s.bubbles.forEach(b=>drawBubble(ctx,b,s.agents,now))

    // 10. HUD overlays (above bubbles)
    s.agents.forEach(a=>drawAgentHUD(ctx,a,now))

    // 11. Status bar
    drawStatusBar(ctx,s.counters,s.agents,s.tick)

    // 12. Scanlines
    drawScanlines(ctx)

    animRef.current=requestAnimationFrame(draw)
  },[])

  useEffect(()=>{
    animRef.current=requestAnimationFrame(draw)
    return ()=>cancelAnimationFrame(animRef.current)
  },[draw])

  // ── Selected agent detail (from React state) ───────────────────────────────
  const selectedAgent = selectedId
    ? sim.current.agents.get(selectedId) ?? null
    : null

  return (
    <section className="swarm-sim-panel" aria-label="SwarmVision live orchestration">
      <header className="swarm-sim-header">
        <button type="button" className="swarm-sim-toggle"
          onClick={()=>setCollapsed(c=>!c)} aria-expanded={!collapsed}>
          <span className="swarm-sim-chevron">{collapsed?'▶':'▼'}</span>
          <span className="swarm-sim-title">SWARM ORCHESTRATION</span>
          <span className="swarm-sim-live-badge">
            <span className="swarm-sim-live-dot"/>LIVE
          </span>
        </button>

        <div className="swarm-sim-counters">
          {([
            {label:'PROCESSED',val:counters.processed,cls:'cyan'},
            {label:'SHIPPED',  val:counters.shipped,  cls:'green'},
            {label:'ERRORS',   val:counters.errors,   cls:'red'},
            {label:'INSIGHTS', val:counters.insights, cls:'gold'},
          ] as const).map(s=>(
            <div key={s.label} className="swarm-sim-stat">
              <span className="stat-label">{s.label}</span>
              <span className={`stat-val ${s.cls}`}>{s.val}</span>
            </div>
          ))}
        </div>

        <div className="swarm-sim-speed-group">
          {([1,2,5] as const).map(s=>(
            <button key={s} type="button"
              className={`swarm-sim-spd${speed===s?' active':''}`}
              onClick={()=>setSpeed(s)}>{s}×</button>
          ))}
        </div>
      </header>

      {!collapsed&&(
        <div className="swarm-sim-body">
          <div className="swarm-sim-canvas-wrap">
            <canvas ref={canvasRef} width={W} height={H}
              onClick={handleCanvasClick}
              style={{cursor:'crosshair'}}
            />
          </div>

          <div className="swarm-sim-sidebar">
            {/* Selected agent detail */}
            {selectedAgent&&(
              <div className="swarm-sim-agent-card">
                <div className="agent-card-header" style={{borderColor:agentColor(selectedAgent)}}>
                  <span className="agent-card-id">{selectedAgent.id}</span>
                  <span className={`agent-card-state state-${selectedAgent.state.toLowerCase()}`}>
                    {selectedAgent.state}
                  </span>
                </div>
                <div className="agent-card-row"><span>ZONE</span><span>{selectedAgent.zone}</span></div>
                <div className="agent-card-row"><span>TRACE</span><span>{selectedAgent.traceId.slice(0,12)||'—'}</span></div>
                <div className="agent-card-row"><span>STEP</span><span>{selectedAgent.stepIndex||'—'}</span></div>
                <div className="agent-card-row"><span>LATENCY</span><span>{selectedAgent.latency?`${selectedAgent.latency}ms`:'—'}</span></div>
                <div className="agent-card-row"><span>ACTION</span><span>{selectedAgent.lastAction||'—'}</span></div>
                <div className="agent-card-row"><span>ERR RATE</span><span>{selectedAgent.errorRate?`${(selectedAgent.errorRate*100).toFixed(1)}%`:'—'}</span></div>
              </div>
            )}
            {!selectedAgent&&(
              <div className="swarm-sim-hint">Click an agent to inspect</div>
            )}

            {/* Event log */}
            <div className="swarm-sim-log" role="log" aria-label="Event log">
              {logEntries.map((e,i)=>(
                <div key={i} className="swarm-sim-log-row">
                  <span className="swarm-sim-log-dot" style={{background:e.color}}/>
                  <span className="swarm-sim-log-msg">{e.msg}</span>
                  <span className="swarm-sim-log-ts">{Math.round((Date.now()-e.ts)/1000)}s</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
