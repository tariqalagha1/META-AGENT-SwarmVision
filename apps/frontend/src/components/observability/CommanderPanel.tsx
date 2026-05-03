import { useEffect, useRef, useState } from 'react'
import { useObservabilityStore } from '../../store'
import './CommanderPanel.css'

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  void:        '#05040A',
  surface:     '#0A0806',
  surfaceAlt:  '#0F0C08',
  panel:       '#120E08',
  panelBorder: '#2A1E08',
  gold:        '#FFB800',
  goldBright:  '#FFD060',
  goldDim:     '#8A6200',
  goldGlow:    '#CC9000',
  amber:       '#FF8C00',
  amberDim:    '#6A3800',
  active:      '#44FF88',
  activeDim:   '#1A4A2A',
  warning:     '#FF6600',
  danger:      '#FF2244',
  dangerDim:   '#4A0A14',
  info:        '#00CCFF',
  xpFill:      '#FFB800',
  xpTrack:     '#1A1408',
  xpGlow:      '#CC9000',
  missionFill: '#44BB66',
  missionTrack:'#0A1A0E',
  textBright:  '#FFE8A0',
  textMid:     '#B08840',
  textDim:     '#503C18',
  textWhite:   '#F0E8D0',
  scanline:    'rgba(255,180,0,0.03)',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const XP_PER_LEVEL = 1000

const XP_MAP: Record<string, number> = {
  TASK_SUCCESS:       50,
  TASK_HANDOFF:       20,
  META_INSIGHT:      100,
  AGENT_SPAWN:        10,
  DECISION:           15,
  DECISION_POINT:     15,
  TASK_START:          5,
  HEALTH_CHECK:        5,
  PIPELINE_UPDATE:     5,
  SWARM_STARTED:      10,
  SWARM_COMPLETE:     75,
  STEP_COMPLETE:      10,
  LLM_CALL:            3,
  TOOL_CALL:           3,
  TASK_FAIL:         -50,
  ANOMALY:           -30,
  AGENT_TERMINATION: -10,
  STEP_FAILED:       -20,
  RETRY:             -10,
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Mission {
  id:       string
  label:    string
  icon:     string
  target:   number
  current:  number
  xpReward: number
  complete: boolean
}

interface Achievement {
  id:         string
  icon:       string
  title:      string
  desc:       string
  unlockedAt: number | null
}

interface FeedEntry {
  ts:      number
  evType:  string
  agentId: string
  xpDelta: number
  color:   string
}

interface CommanderState {
  xp:           number
  level:        number
  sessionXp:    number
  missions:     Mission[]
  achievements: Achievement[]
  feed:         FeedEntry[]
  uptimeStart:  number
  lastEventId:  string
}

interface DisplayState {
  xp:           number
  level:        number
  sessionXp:    number
  xpInLevel:    number
  missions:     Mission[]
  achievements: Achievement[]
  feed:         FeedEntry[]
  uptime:       string
}

// ─── Mission templates ────────────────────────────────────────────────────────

const MISSION_TEMPLATES: Array<{
  id: string; label: string; icon: string; target: number; xpReward: number;
  eventTypes: string[]
}> = [
  { id:'tasks',     label:'Complete tasks',     icon:'⚡', target:50,  xpReward:500,  eventTypes:['TASK_SUCCESS','STEP_COMPLETE','SWARM_COMPLETE'] },
  { id:'handoffs',  label:'Execute handoffs',   icon:'🔄', target:30,  xpReward:300,  eventTypes:['TASK_HANDOFF','HANDOFF'] },
  { id:'insights',  label:'Surface insights',   icon:'🧠', target:10,  xpReward:1000, eventTypes:['META_INSIGHT'] },
  { id:'decisions', label:'Log decisions',      icon:'⚖️', target:25,  xpReward:250,  eventTypes:['DECISION','DECISION_POINT'] },
  { id:'uptime',    label:'Stay online 10 min', icon:'📡', target:600, xpReward:200,  eventTypes:[] },
]

// ─── Achievement definitions ──────────────────────────────────────────────────

const ACHIEVEMENT_DEFS: Array<{
  id: string; icon: string; title: string; desc: string;
  check: (state: CommanderState, counts: Record<string, number>) => boolean
}> = [
  {
    id:'first_blood', icon:'⚡', title:'First Strike', desc:'Complete your first task',
    check:(_,c)=>(c['TASK_SUCCESS']??0)>=1,
  },
  {
    id:'orchestrator', icon:'🎯', title:'Orchestrator', desc:'Execute 10 handoffs',
    check:(_,c)=>(c['TASK_HANDOFF']??0)>=10,
  },
  {
    id:'mind_palace', icon:'🧠', title:'Mind Palace', desc:'Surface 5 meta insights',
    check:(_,c)=>(c['META_INSIGHT']??0)>=5,
  },
  {
    id:'clean_run', icon:'🛡️', title:'Clean Run', desc:'Reach LV.3 with zero failures',
    check:(s,c)=>s.level>=3&&(c['TASK_FAIL']??0)===0,
  },
  {
    id:'commander', icon:'🏆', title:'Commander', desc:'Reach LV.5',
    check:(s)=>s.level>=5,
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function CommanderPanel(): JSX.Element {
  const cmdRef = useRef<CommanderState>({
    xp:          0,
    level:       1,
    sessionXp:   0,
    missions:    MISSION_TEMPLATES.map(t=>({
      id:t.id, label:t.label, icon:t.icon,
      target:t.target, current:0,
      xpReward:t.xpReward, complete:false,
    })),
    achievements: ACHIEVEMENT_DEFS.map(d=>({
      id:d.id, icon:d.icon, title:d.title, desc:d.desc, unlockedAt:null,
    })),
    feed:        [],
    uptimeStart: Date.now(),
    lastEventId: '',
  })

  const eventCountsRef = useRef<Record<string, number>>({})

  const [display, setDisplay] = useState<DisplayState>({
    xp:0, level:1, sessionXp:0, xpInLevel:0,
    missions:[],
    achievements:[],
    feed:[],
    uptime:'00:00:00',
  })
  const [collapsed,         setCollapsed]         = useState(false)
  const [inspectedAgentId,  setInspectedAgentId]  = useState<string|null>(null)
  const [flashAchievement,  setFlashAchievement]  = useState<Achievement|null>(null)

  const events      = useObservabilityStore(s=>s.events)
  const eventOrder  = useObservabilityStore(s=>s.eventOrder)
  const storeAgents = useObservabilityStore(s=>s.agents)

  // ── Event processing ──────────────────────────────────────────────────────
  useEffect(()=>{
    if(!eventOrder.length) return
    const cmd=cmdRef.current
    const counts=eventCountsRef.current
    if(eventOrder[0]===cmd.lastEventId) return
    cmd.lastEventId=eventOrder[0]

    eventOrder.slice(0,5).forEach(eid=>{
      const ev=events[eid]
      if(!ev) return
      const evRaw=ev as unknown as Record<string,unknown>
      const evType=String(ev.event_type??evRaw['type']??'')
      const agentId=String(ev.agent_id??'system')

      // XP
      const delta=XP_MAP[evType]??0
      cmd.xp=Math.max(0,cmd.xp+delta)
      cmd.sessionXp+=Math.max(0,delta)
      cmd.level=Math.floor(cmd.xp/XP_PER_LEVEL)+1

      // Event counts
      counts[evType]=(counts[evType]??0)+1

      // Mission progress
      cmd.missions.forEach(m=>{
        const tmpl=MISSION_TEMPLATES.find(t=>t.id===m.id)
        if(!tmpl||m.id==='uptime') return
        if(tmpl.eventTypes.includes(evType)){
          m.current=Math.min(m.target,m.current+1)
          if(m.current>=m.target&&!m.complete){
            m.complete=true
            cmd.xp+=m.xpReward
            cmd.sessionXp+=m.xpReward
            cmd.level=Math.floor(cmd.xp/XP_PER_LEVEL)+1
            setTimeout(()=>{ m.current=0; m.complete=false },2000)
          }
        }
      })

      // Achievement check
      ACHIEVEMENT_DEFS.forEach((def,i)=>{
        const ach=cmd.achievements[i]
        if(ach.unlockedAt) return
        if(def.check(cmd,counts)){
          ach.unlockedAt=Date.now()
          setFlashAchievement({...ach})
          setTimeout(()=>setFlashAchievement(null),3000)
        }
      })

      // Feed
      const feedColor=delta>0?C.active:delta<0?C.danger:C.info
      cmd.feed.unshift({ts:Date.now(),evType,agentId,xpDelta:delta,color:feedColor})
      if(cmd.feed.length>20) cmd.feed.length=20
    })
  },[eventOrder,events])

  // ── Uptime mission + flush display every 400ms ────────────────────────────
  useEffect(()=>{
    const iv=setInterval(()=>{
      const cmd=cmdRef.current
      const elapsed=Math.floor((Date.now()-cmd.uptimeStart)/1000)

      // Uptime mission
      const uptimeMission=cmd.missions.find(m=>m.id==='uptime')
      if(uptimeMission&&!uptimeMission.complete){
        uptimeMission.current=Math.min(uptimeMission.target,elapsed)
        if(uptimeMission.current>=uptimeMission.target&&!uptimeMission.complete){
          uptimeMission.complete=true
          cmd.xp+=uptimeMission.xpReward
          cmd.sessionXp+=uptimeMission.xpReward
          cmd.level=Math.floor(cmd.xp/XP_PER_LEVEL)+1
          setTimeout(()=>{ uptimeMission.current=0; uptimeMission.complete=false },2000)
        }
      }

      const h=Math.floor(elapsed/3600).toString().padStart(2,'0')
      const m=Math.floor((elapsed%3600)/60).toString().padStart(2,'0')
      const s=(elapsed%60).toString().padStart(2,'0')

      setDisplay({
        xp:           cmd.xp,
        level:        cmd.level,
        sessionXp:    cmd.sessionXp,
        xpInLevel:    cmd.xp%XP_PER_LEVEL,
        missions:     [...cmd.missions],
        achievements: [...cmd.achievements],
        feed:         cmd.feed.slice(0,5),
        uptime:       `${h}:${m}:${s}`,
      })
    },400)
    return ()=>clearInterval(iv)
  },[])

  const agentList = Object.values(storeAgents)

  return (
    <section className="cmd-panel" aria-label="Commander panel">

      {/* Achievement flash */}
      {flashAchievement&&(
        <div className="cmd-achievement-flash">
          <span className="cmd-ach-flash-icon">{flashAchievement.icon}</span>
          <span className="cmd-ach-flash-title">ACHIEVEMENT UNLOCKED — {flashAchievement.title}</span>
          <span className="cmd-ach-flash-desc">{flashAchievement.desc}</span>
        </div>
      )}

      {/* Header */}
      <header className="cmd-header">
        <div className="cmd-avatar">
          <svg width="48" height="48" viewBox="0 0 48 48">
            <polygon points="24,2 44,13 44,35 24,46 4,35 4,13"
              fill="#120E08" stroke="#FFB800" strokeWidth="1.5"/>
            <text x="24" y="29" textAnchor="middle"
              fill="#FFB800" fontSize="18" fontFamily="monospace">⚔</text>
          </svg>
        </div>

        <div className="cmd-identity">
          <div className="cmd-rank-label">COMMANDER</div>
          <div className="cmd-level">
            LV.<span className="cmd-level-num">{display.level}</span>
          </div>
          <div className="cmd-xp-bar-wrap">
            <div className="cmd-xp-bar-track">
              <div
                className="cmd-xp-bar-fill"
                style={{width:`${Math.min(100,(display.xpInLevel/XP_PER_LEVEL)*100)}%`}}
              />
            </div>
            <span className="cmd-xp-label">
              {display.xpInLevel.toLocaleString()} / {XP_PER_LEVEL.toLocaleString()} XP
            </span>
          </div>
        </div>

        <div className="cmd-header-stats">
          <div className="cmd-stat">
            <span className="cmd-stat-label">SESSION XP</span>
            <span className="cmd-stat-val gold">+{display.sessionXp.toLocaleString()}</span>
          </div>
          <div className="cmd-stat">
            <span className="cmd-stat-label">UPTIME</span>
            <span className="cmd-stat-val">{display.uptime}</span>
          </div>
          <div className="cmd-stat">
            <span className="cmd-stat-label">TOTAL XP</span>
            <span className="cmd-stat-val">{display.xp.toLocaleString()}</span>
          </div>
        </div>

        <button type="button" className="cmd-collapse-btn"
          onClick={()=>setCollapsed(c=>!c)}>
          {collapsed?'▶ EXPAND':'▼ COLLAPSE'}
        </button>
      </header>

      {!collapsed&&(
        <>
          <div className="cmd-body">

            {/* Missions */}
            <div className="cmd-section cmd-missions">
              <div className="cmd-section-title">⚡ ACTIVE MISSIONS</div>
              {display.missions.map(m=>(
                <div
                  key={m.id}
                  className={`cmd-mission-row${m.complete?' complete':''}`}
                >
                  <span className="cmd-mission-icon">{m.icon}</span>
                  <div className="cmd-mission-body">
                    <div className="cmd-mission-label">{m.label}</div>
                    <div className="cmd-mission-bar-wrap">
                      <div className="cmd-mission-bar-track">
                        <div
                          className="cmd-mission-bar-fill"
                          style={{width:`${Math.min(100,(m.current/m.target)*100)}%`}}
                        />
                      </div>
                      <span className="cmd-mission-count">{m.current}/{m.target}</span>
                    </div>
                  </div>
                  <span className="cmd-mission-xp">+{m.xpReward} XP</span>
                </div>
              ))}
            </div>

            {/* Agent roster */}
            <div className="cmd-section cmd-roster">
              <div className="cmd-section-title">🤖 AGENT ROSTER</div>
              {agentList.length===0&&(
                <div className="cmd-empty">No agents connected</div>
              )}
              {agentList.map(agent=>(
                <button
                  key={agent.agent_id}
                  type="button"
                  className={`cmd-agent-row${inspectedAgentId===agent.agent_id?' selected':''}`}
                  onClick={()=>setInspectedAgentId(id=>id===agent.agent_id?null:agent.agent_id)}
                >
                  <span className={`cmd-agent-dot state-${agent.state.toLowerCase()}`}/>
                  <span className="cmd-agent-name">{agent.agent_id.slice(0,14)}</span>
                  <span className={`cmd-agent-state state-${agent.state.toLowerCase()}`}>
                    {agent.state}
                  </span>
                </button>
              ))}

              {/* Inspector */}
              {inspectedAgentId&&storeAgents[inspectedAgentId]&&(()=>{
                const ag=storeAgents[inspectedAgentId]
                return (
                  <div className="cmd-inspector">
                    <div className="cmd-inspector-header">
                      <span>{inspectedAgentId}</span>
                      <button type="button" onClick={()=>setInspectedAgentId(null)}>✕</button>
                    </div>
                    <div className="cmd-inspector-row">
                      <span>State</span>
                      <span className={`state-${ag.state.toLowerCase()}`}>{ag.state}</span>
                    </div>
                    <div className="cmd-inspector-row">
                      <span>Latency avg</span>
                      <span>{ag.latency_avg.toFixed(0)}ms</span>
                    </div>
                    <div className="cmd-inspector-row">
                      <span>Error rate</span>
                      <span>{(ag.error_rate*100).toFixed(1)}%</span>
                    </div>
                    <div className="cmd-inspector-row">
                      <span>Throughput</span>
                      <span>{ag.throughput}/min</span>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Achievements */}
            <div className="cmd-section cmd-achievements">
              <div className="cmd-section-title">🏆 ACHIEVEMENTS</div>
              {display.achievements.map(ach=>(
                <div
                  key={ach.id}
                  className={`cmd-ach-row${ach.unlockedAt?' unlocked':' locked'}`}
                >
                  <span className="cmd-ach-icon">{ach.icon}</span>
                  <div className="cmd-ach-body">
                    <div className="cmd-ach-title">{ach.title}</div>
                    <div className="cmd-ach-desc">{ach.desc}</div>
                    {ach.unlockedAt&&(
                      <div className="cmd-ach-time">
                        Unlocked {Math.round((Date.now()-ach.unlockedAt)/60000)}m ago
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live feed strip */}
          <div className="cmd-feed" role="log" aria-label="Live event feed">
            <span className="cmd-feed-label">LIVE FEED</span>
            {display.feed.map((entry,i)=>(
              <div key={i} className="cmd-feed-entry">
                <span className="cmd-feed-dot" style={{background:entry.color}}/>
                <span className="cmd-feed-type">{entry.evType}</span>
                <span className="cmd-feed-agent">{entry.agentId.slice(0,10)}</span>
                <span
                  className="cmd-feed-xp"
                  style={{color:entry.xpDelta>=0?C.gold:C.danger}}
                >
                  {entry.xpDelta>=0?'+':''}{entry.xpDelta} XP
                </span>
                <span className="cmd-feed-ts">
                  {Math.round((Date.now()-entry.ts)/1000)}s
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
