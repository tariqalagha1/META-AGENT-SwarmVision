# SwarmVisionCinematic — UE5 Project Setup

## Prerequisites

- Unreal Engine 5.4 installed via Epic Games Launcher
- Visual Studio 2022 with "Game development with C++" workload
- event-relay service built: `services/event-relay/`

## First-time setup

1. Right-click `SwarmVisionCinematic.uproject` → **Generate Visual Studio project files**
2. Open `SwarmVisionCinematic.sln` in Visual Studio 2022
3. Build target: `SwarmVisionCinematicEditor (Development Editor)`
4. Launch from VS (F5) or double-click the `.uproject` to open in UE5 Editor

## Project Settings (do once after first launch)

### GameInstance class
`Project Settings → Maps & Modes → Game Instance Class → USwarmGameInstance`

### Default GameMode
`Project Settings → Maps & Modes → Default GameMode → ASwarmGameMode`

### WebSockets plugin
Already enabled in `.uproject`. Verify at `Edit → Plugins → Web → WebSockets ✓`

## Level setup for Phase 1 end-to-end test

1. Create a new level (`File → New Level → Empty Level`)
2. Add a `Sky Light` + `Directional Light` for visibility
3. Place actors:
   - **ASwarmTestInjector** — one instance, `bPrintEventsToScreen = true`
   - **ASwarmEventVisualizer** — three instances:
     - WatchAgentId = `fetch_agent`
     - WatchAgentId = `normalize_agent`
     - WatchAgentId = `quality_agent`
   - **ASwarmCameraDirector** — one instance
   - **ACameraActor** × 7 — name each exactly:
     - `Camera_Entry`
     - `Camera_Fetch`
     - `Camera_Normalize`
     - `Camera_Quality`
     - `Camera_Corridor`
     - `Camera_Mezzanine`
     - `Camera_Gate`
4. Save the level, set as default in Project Settings

## Running the Phase 1 end-to-end test

### Test A — Injected events (no backend required)
1. Press Play in UE5 Editor
2. Select `ASwarmTestInjector` in the outliner
3. In Details panel → **Run Demo Sequence** (CallInEditor button)
4. Watch the Output Log — expect 23 events to appear in order
5. Watch the three `ASwarmEventVisualizer` light actors change color per agent
6. Watch `ASwarmCameraDirector` switch cameras in the viewport

Expected log output:
```
[LogSwarmTest] Demo sequence started — 23 events, interval=1.0s
[LogSwarmRelay] [P1 High] type=SwarmStarted        agent=—          trace=<trace>
[LogSwarmRelay] [P2 Normal] type=PlannerDecision   agent=—          trace=<trace>
[LogSwarmRelay] [P2 Normal] type=AgentStepStarted  agent=fetch_agent trace=<trace>
...
[LogSwarmTest] STATE ▶ fetch_agent → Working
[LogSwarmTest] STATE ▶ fetch_agent → HandoffSource
...
[LogSwarmRelay] [P0 Critical] type=AgentStepRetry  agent=quality_agent trace=<trace>
...
[LogSwarmRelay] [P1 High] type=SwarmCompleted      agent=—           trace=<trace>
[LogSwarmTest] Demo sequence complete
[LogSwarmTest] === Agent States (3) ===
[LogSwarmTest]   fetch_agent      state=Complete  step=fetch-retry
[LogSwarmTest]   normalize_agent  state=Complete  step=normalize-retry
[LogSwarmTest]   quality_agent    state=Complete  step=quality-retry  score=87.0
```

### Test B — Live backend events
1. Start the FastAPI backend: `cd apps/backend && uvicorn app.main:app --port 8012`
2. Start the event-relay: `cd services/event-relay && npm start`
3. Press Play in UE5 Editor
4. In a separate terminal: `curl -X POST http://localhost:8012/events/broadcast -H "Content-Type: application/json" -d "{\"event_type\":\"SWARM_STARTED\",\"source\":\"test\"}"`
5. Watch Output Log — expect `SWARM_STARTED` to appear within 200ms

## Environment variable overrides

| Variable | Default | Purpose |
|---|---|---|
| `SWARM_RELAY_URL` | `ws://localhost:9000` | Override relay URL for cloud deployment |

Set in UE5: `Edit → Project Settings → Platforms → Windows → Environment Variables`
Or set in the OS before launching the editor.

## File map

| File | Purpose |
|---|---|
| `Public/Data/SwarmEventTypes.h` | All enums: ESwarmEventType, EAgentVisualState, EEventPriority |
| `Public/Data/SwarmEvent.h` | FSwarmEvent, FQueuedEvent, FAgentStateRecord structs |
| `Public/Subsystems/SwarmEventRouterSubsystem.h` | Core subsystem header |
| `Private/Subsystems/SwarmEventRouterSubsystem.cpp` | WebSocket, parser, queue, state machine |
| `Public/Agents/SwarmTestInjector.h` | Test injection actor |
| `Private/Agents/SwarmTestInjector.cpp` | Demo sequence, InjectEvent BP API |
| `Public/Agents/SwarmEventVisualizer.h` | Phase 1 visual proof — colored light per agent |
| `Private/Agents/SwarmEventVisualizer.cpp` | Color tables, light + text update |
| `Public/Camera/SwarmCameraDirector.h` | Phase 1 camera director |
| `Private/Camera/SwarmCameraDirector.cpp` | Event → camera switching |
