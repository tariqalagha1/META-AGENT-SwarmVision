# SwarmVision — Visual UI & User Experience Guide

## 🎨 The Dashboard Interface

### Full Screen Layout

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  SwarmVision Dashboard                   [LIVE] [PAUSED] ⟳ Reconnect   ⚙️   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Channel Health:  📊 Events: 247 active   🚨 Alerts: 3 recent               ║
║                   ⚙️  Metrics: 12 agents   👥 Agents: 12 (11 ACTIVE, 1 DEG) ║
╠═══════════════════════════════════════════════╦═══════════════════════════════╣
║                                               ║                               ║
║     SYSTEM GRAPH                              ║    ALERTS STREAM              ║
║     (Interactive)                             ║    (Live-Updated)             ║
║                                               ║                               ║
║              Agent Network Visualization      ║  🚨 BOTTLENECK DETECTED       ║
║              ┌─────────────────────┐          ║     Agent: router-1           ║
║              │   ● ─── ● ─── ●    │          ║     P95 Latency: 3,200ms      ║
║              │  ╱   ╲   |   ╱   ╲ │          ║     Threshold: 2,000ms        ║
║              │ ●     ● ─ ●     ●  │          ║     Evidence: evt-2847, 2891  ║
║              │ │ 🟦 │   │ 🟧   │  │          ║     Severity: HIGH            ║
║              │ └─────┴───┴─────┘  │          ║                               ║
║              │     [740x420px]     │          ║  🔴 LOAD RISK DETECTED        ║
║              └─────────────────────┘          ║     Throughput: 78 req/min    ║
║              [750px wide]                     ║     Latency up, 2 agents DEG ║
║              │ ACTIVE │ DEGRADED │ FAILED    ║     Severity: CRITICAL        ║
║              │ 🟦     │ 🟧      │ 🟥       ║                               ║
║              │ 11     │ 1       │ 0        ║  ⚠️  REPEATED FAILURES (4x in 5m)║
║                                               ║     Agent: worker-2           ║
║  [Double-click to focus] [Drag to pan]        ║     Error: "Validation failed"║
║  [Scroll to zoom]                             ║     Severity: MEDIUM          ║
╠═══════════════════════════════════════════════╬═══════════════════════════════╣
║                                               ║                               ║
║                                               ║   EXECUTION TIMELINE          ║
║                                               ║   (For selected trace/agent)  ║
║                                               ║                               ║
║          [Space saved for future panels]      ║   Step 1 ▶ TASK_START         ║
║                                               ║           14:32:15.847       ║
║                                               ║   Step 2 ⇄ TASK_HANDOFF      ║
║                                               ║           14:32:15.923       ║
║                                               ║   Step 3 ◆ DECISION          ║
║                                               ║           Flag: APPROVED      ║
║                                               ║           Confidence: 0.94    ║
║                                               ║           14:32:16.102       ║
║                                               ║   Step 4 ⚠️ ANOMALY           ║
║                                               ║           Data validation err ║
║                                               ║           14:32:16.445       ║
║                                               ║   Step 5 ✕ ERROR             ║
║                                               ║           Max retries exceeded║
║                                               ║           14:32:18.201       ║
║                                               ║                               ║
║                                               ╠═══════════════════════════════╣
║                                               ║                               ║
║                                               ║   DECISION LOG                ║
║                                               ║   (Searchable, filterable)    ║
║                                               ║                               ║
║                                               ║  Timestamp      Agent    Dec. ║
║                                               ║  14:32:16.102  router1  ✓✓✓  ║
║                                               ║  14:32:14.891  router2  ✗✗✗  ║
║                                               ║  14:32:13.456  router1  ⚡⚡⚡ ║
║                                               ║  14:32:12.223  router2  ✓✓✓  ║
║                                               ║  14:32:11.001  router1  🔄🔄🔄║
║                                               ║                               ║
║                                               ║  [APPROVED] [REJECTED]       ║
║                                               ║  [ESCALATED] [FALLBACK]      ║
║                                               ║  🔍 Search decisions...      ║
║                                               ║                               ║
╚═══════════════════════════════════════════════╩═══════════════════════════════╝
```

---

## 🔴 Agent Status Colors & Meanings

### Visual Status Indicators

|  | Status | Color | Ring | Indicator | Animation | Meaning |
|---|---|---|---|---|---|---|
| 🟦 | ACTIVE | Cyan (#00C8FF) | Solid thick | None | None | ✅ Healthy, processing normally |
| 🟧 | DEGRADED | Amber (#FFA500) | Pulsing | Dot (●) | Pulse 1s | ⚠️ Slow/failing some tasks, needs attention |
| 🟥 | FAILED | Red (#E74C3C) | Solid thick | X (✕) | None | 🚨 Down/not processing, critical |

### Real Example on Graph

```
Agent States in Live System:

         router-1 (🟦)         worker-1 (🟦)
         ACTIVE                ACTIVE
             │                     │
             └─────orch────────────┤
                   (🟧)            │
                   DEGRADED        │
                   [pulsing]    worker-2 (🟥)
                                FAILED
                                [X indicator]
```

---

## 📊 The System Graph Panel (Left Side)

### What You're Looking At

**The graph represents**:
- 🔵 **Nodes** = Individual agents in your system
- 📍 **Position** = Deterministically laid out (same position each time you refresh)
- ↔️ **Edges** = Communication/handoffs between agents
- 🎨 **Color** = Real-time health status
- ⏱️ **Animation** = Updates as agent state changes

### Interactions

| Action | Result |
|---|---|
| **Click on node** | Selects agent → loads latest trace in timeline |
| **Double-click** | Focuses on that agent + nearby agents |
| **Drag to pan** | Move around canvas |
| **Scroll** | Zoom in/out |
| **Hover over node** | Shows agent ID tooltip |
| **Hover over edge** | Shows interaction type (TASK_HANDOFF, etc.) |

### Example Journey

```
1. System shows: 12 agents, all ACTIVE (cyan)
   User sees: "System looks healthy"

2. One agent goes DEGRADED (amber with pulse)
   User sees: "Something's wrong, let me check"

3. User clicks DEGRADED agent
   Timeline loads for that agent's latest trace
   User sees: "Ah, it's slow on Step 3"

4. User expands Step 3 in timeline
   JSON drawer shows full context
   User sees: "Input data is malformed, that's why it's slow"

5. User can now fix upstream agent
```

---

## 🚨 Alert Stream Panel (Top-Right)

### Alert Anatomy

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠️  ANOMALY TYPE: BOTTLENECK DETECTED                               │
│                                                                      │
│ Location: agent-router-1                                            │
│ Metric: P95 Latency = 3,200ms (threshold: 2,000ms)                 │
│ Evidence: 3 traces affected                                         │
│ Event IDs: evt-2847, evt-2891, evt-2915                           │
│ Agent State: DEGRADED                                               │
│ Severity: 🔴 HIGH                                                  │
│ Detected: 2 minutes ago                                             │
│                                                                      │
│ [Click to drill in]  [Dismiss]  [Mute this pattern]               │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Each Alert Type Matters

| Alert Type | What It Means | User Action |
|---|---|---|
| **BOTTLENECK** | Agent is slow but still working | Investigate latency, scale resources |
| **REPEATED_FAILURE** | Agent keeps failing on same error | Fix root cause (usually input data) |
| **DECISION_PATTERN** | Router repeating same decision pattern | Check if pattern is healthy or broken |
| **ANOMALY_CORRELATION** | Spike in errors after specific decision | Decision might be wrong, check confidence |
| **LOAD_RISK** | High load + degraded agents | System at risk of cascade failure |

---

## 📈 Timeline Panel (Middle-Right)

### Event Types & Icons

```
Step 1  ▶  TASK_START
            Task initiated by agent
            Color: Blue
            
Step 2  ⇄  TASK_HANDOFF
            Work passed between agents
            Color: Purple
            
Step 3  ◆  DECISION
            Router/AI made a choice
            Includes: flag (APPROVED/REJECTED/etc), confidence
            Color: Green
            
Step 4  ⚠️  ANOMALY
            Unexpected behavior detected
            Color: Orange
            
Step 5  ✕  ERROR
            System or business logic error
            Color: Red
            
Step 6  ℹ️  INFO
            Informational event
            Color: Gray
```

### Reading the Timeline

```
Timeline for trace #5847 (selected):

14:32:15.000 ▶ TASK_START
             orchestrator started routing task
             Payload: { task_id: "TSK-1001", priority: "high", ... }

14:32:15.847 ⇄ TASK_HANDOFF
             passed to router-1 for decision making
             Decision required: Is this task worth processing?

14:32:16.102 ◆ DECISION
             APPROVED (confidence: 0.94)
             router-1 decided: YES, this is high-value task
             Reasoning: priority=high AND user_tier=premium

14:32:16.445 ⇄ TASK_HANDOFF
             passed to worker-2 for execution

14:32:16.500 ▶ TASK_START
             worker-2 started processing

14:32:18.103 ⚠️ ANOMALY
             Data validation failed
             Input format error: schema_version mismatch
             Expected: "1.0", got: "0.9"

14:32:18.104 ✕ ERROR
             Task failed after 3 retries
             Last error: Validation failed on field 'schema_version'

14:32:18.201 ◆ DECISION
             FALLBACK (confidence: 0.58)
             router-1 decided: Use fallback handler
             Reasoning: Worker failed, fallback available
```

**User reads this top-to-bottom**: "Trace started, got routed, got approved, went to worker, failed on schema validation, fell back."

### Timeline Interactions

| Action | Result |
|---|---|
| **Click step** | Expands to show full JSON |
| **Hover timestamp** | Shows absolute time + relative time |
| **Scroll** | Loads more steps above/below |
| **Expand JSON** | Shows input/output/context fully |
| **Copy JSON** | Copies to clipboard for sharing |

---

## 📋 Decision Log Panel (Bottom-Right)

### Decision Log Structure

```
┌────────────┬──────────────┬──────────┬────────────┬──────────┐
│ Timestamp  │ Agent        │ Decision │ Confidence │ Trace ID │
├────────────┼──────────────┼──────────┼────────────┼──────────┤
│ 14:32:16   │ router-1     │ ✅ APPROVED  │ 0.94   │ trace-5847 │
│ 14:32:14   │ router-2     │ ❌ REJECTED  │ 0.87   │ trace-5846 │
│ 14:32:13   │ router-1     │ ⚡ ESCALATED │ 0.52   │ trace-5845 │
│ 14:32:12   │ router-2     │ ✅ APPROVED  │ 0.91   │ trace-5844 │
│ 14:32:11   │ router-1     │ 🔄 FALLBACK  │ 0.68   │ trace-5843 │
│ 14:32:10   │ router-1     │ ✅ APPROVED  │ 0.89   │ trace-5842 │
└────────────┴──────────────┴──────────┴────────────┴──────────┘

Decision Flags:
✅ APPROVED   — Go ahead with task
❌ REJECTED   — Don't process this task
⚡ ESCALATED — Send to human for review
🔄 FALLBACK   — Use alternate/backup handler
⏸️  BLOCKED    — Temporarily hold until condition met
```

### Filter & Search

```
Decision Log Controls:
┌─────────────────────────────────────────┐
│ 🔍 Search decisions...                  │
│                                         │
│ Filter by decision:                    │
│ ☑️  APPROVED   ☑️  REJECTED             │
│ ☑️  ESCALATED  ☑️  FALLBACK             │
│ ☑️  BLOCKED                             │
│                                         │
│ Filter by agent:                       │
│ ☑️  router-1   ☑️  router-2            │
│ ☑️  worker-1   ☑️  worker-2            │
│ ☑️  All agents                          │
│                                         │
│ Time range:                             │
│ [Last 1 hour ▼]                        │
└─────────────────────────────────────────┘
```

### Example Search Results

**Search**: "ValidationError"
**Found**: 7 decisions where downstream processing failed on schema validation

**Result**: Realize decisions are correct, but workers have old schema expectations
**Action**: Update worker schema version

---

## 📱 Top Controls & Status Bar

### Mode Buttons

```
┌──────────┬──────────┬──────────────────────────────┐
│ [LIVE]   │ [PAUSED] │ ⟳ Reconnect   ⚙️ Settings   │
└──────────┴──────────┴──────────────────────────────┘

🔵 LIVE Mode
   • Real-time updates from WebSocket
   • New events appear instantly
   • Timeline grows as trace progresses
   • Alerts pop in as they're detected

⏸️ PAUSED Mode
   • Freezes current data snapshot
   • Useful for analyzing one trace deeply
   • No new updates (green header indicator)
   • Can unpause anytime to resume live feed
```

### Health Indicators

```
Channel Health Strip:

📊 Events: 247 active
   (Number of events currently in memory)

🚨 Alerts: 3 recent
   (Number of active anomalies)

⚙️ Metrics: showing live data
   (Dashboard metrics processor status)

👥 Agents: 12 online (11 ACTIVE, 1 DEGRADED, 0 FAILED)
   (Total agents + breakdown by status)
```

---

## 🎨 Color Language

### Semantic Colors

```
Status Colors (Always consistent):
  🟦 Cyan (#00C8FF)      = Good, healthy, active
  🟧 Amber (#FFA500)     = Warning, degraded, needs attention
  🟥 Red (#E74C3C)       = Critical, failed, down

Event Type Colors:
  🔵 Blue               = TASK_START, normal event
  🟣 Purple             = TASK_HANDOFF, routing
  🟢 Green              = DECISION, AI/router decision
  🟠 Orange             = ANOMALY, unexpected behavior
  🔴 Red                = ERROR, failure
  ⚪ Gray               = INFO, informational

Confidence Indicator:
  🟦 Bright (0.9+)      = High confidence decision
  🟩 Medium (0.7-0.9)   = Normal confidence
  🟨 Dim (< 0.7)        = Low confidence (risky decision)
```

---

## 🖱️ Common User Workflows

### Workflow 1: "The System Just Slowed Down"

```
1. Launch dashboard → See graph, all agents cyan (ACTIVE)
2. Wait 5 seconds → One agent turns amber (DEGRADED)
3. Alert appears at top: "BOTTLENECK DETECTED"
4. Click alert → Timeline loads
5. See Step 3 took 3 seconds instead of 100ms
6. Expand Step 3 → See it was waiting for database query
7. Root cause found: Database slow
8. Action: Investigate database, not application
```

### Workflow 2: "Decision Quality Check"

```
1. Open Decision Log
2. Filter by: router2 + REJECTED decision type
3. See 20 REJECTED decisions in last hour
4. Click each one → All were correctly identified spam
5. But see: 2 legitimate tasks also rejected (false positives)
6. Check confidence: Low (0.61, 0.58) — below threshold
7. Insight: Threshold is too aggressive
8. Action: Tune confidence threshold upward
```

### Workflow 3: "Incident Investigation"

```
1. Alert: "LOAD_RISK DETECTED"
2. Click alert → Focus on timeline of load peak
3. See: High throughput (100 req/sec) + 2 agents degraded
4. Check Decision Log → Decisions still being made (good)
5. Filter to affected traces → See pattern
6. All slow traces have Decision flag = FALLBACK
7. Insight: Fallback handler is bottleneck
8. Action: Optimize fallback handler
```

---

## 💡 Visual Patterns Users Learn

### Pattern 1: Cascade Failure Pattern
```
Timeline shows:
  TASK_START (agent1)
  DECISION APPROVED (high confidence)
  TASK_HANDOFF (agent2)
    ANOMALY (validation error)
    ERROR (retry exhausted)
  DECISION FALLBACK (agent1, low confidence)
    TASK_HANDOFF (agent3)
    ANOMALY (same validation error)
    ERROR (retry exhausted)

User learns: "Upstream is sending bad data"
```

### Pattern 2: Decision Drift Pattern
```
Decision Log shows:
  14:30 router1 APPROVED (0.95)
  14:30 router1 APPROVED (0.94)
  14:30 router1 APPROVED (0.92)
  14:31 router1 APPROVED (0.87) ← Confidence dropping
  14:31 router1 APPROVED (0.81)
  14:32 router1 REJECTED (0.78) ← Changed decision

User learns: "Confidence drifting, model may be degrading"
```

### Pattern 3: Load Spike Pattern
```
Graph shows:
  All agents ACTIVE (normal)
  → 3 agents DEGRADED (amber pulse)
  → 1 agent FAILED (red)
  → 4 agents DEGRADED

Timeline shows:
  High task volume spike
  Long wait times between steps
  Retry loops

User learns: "System overloaded, needs scaling"
```

---

## 🔔 Real-Time Update Behavior

### Visual Changes You See

```
Scenario: New alert arrives while viewing

State 1 (Before):
  Alerts Stream shows 2 alerts
  
State 2 (Update arrives — milliseconds):
  New alert slides in at top
  → "3 Alerts" indicator updates
  → New alert has yellow background (highlight)
  → Timeline may auto-load new trace
  
State 3 (After user dismisses highlight):
  Alert stays in list (not dismissed)
  → Highlight fades
  → Returns to normal display
```

### WebSocket Batching Behavior

```
Real system sends events very fast:
  Event 1 arrives
  Event 2 arrives
  Event 3 arrives
  [batch window: 300ms]
  Event 4 arrives
  Event 5 arrives

UI sees:
  [300ms pause]
  ✨ Timeline updates with 3 events at once
  [300ms pause]
  ✨ Timeline updates with 2 events at once

Why: Prevents flickering, reduces CPU usage
```

---

## 📌 Key Statistics at a Glance

What the dashboard tells you without clicking anything:

| Metric | What It Means | Green | Yellow | Red |
|---|---|---|---|---|
| **Agent Health** | Overall system | All cyan | 1+ amber | 1+ red |
| **Event Rate** | Throughput | Steady | Spiking | Absent |
| **Alert Count** | Problems | 0 | 1-3 | 4+ |
| **Recent Errors** | Stability | None | 1-2 | 3+ |
| **Decision Pattern** | Router quality | Mostly APPROVED | Mixed | Mostly REJECTED |

---

## 🎯 What's Not on the Dashboard (But Available)

If you hover/click, you can access:

- **Full JSON context** for any event
- **Agent metrics** (CPU, memory, task count)
- **Trace history** (past traces for same agent)
- **Search/filter** across all dimensions
- **Export** data for external analysis
- **Settings** (alert thresholds, retention policy)

---

## Summary: The Dashboard at Different Glances

**Glance 1 (2 seconds)**:
- Is the system healthy?
- How many alerts are active?
- Which agent is causing problems?

**Look 1 (30 seconds)**:
- What just went wrong?
- When did it start?
- Which trace is affected?

**Inspect 1 (5 minutes)**:
- Full trace context
- Decision quality
- Root cause of failure

**Deep dive (30 minutes+)**:
- Pattern analysis
- Decision testing
- Model improvement recommendations

