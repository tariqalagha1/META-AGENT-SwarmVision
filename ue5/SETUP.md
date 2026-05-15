# SwarmVisionCinematic — UE5 Project Setup

## Prerequisites

- Unreal Engine 5.4 installed via Epic Games Launcher
- Visual Studio 2022 with "Game development with C++" workload
- MetaHuman Plugin enabled (Epic Games Launcher → My Library → MetaHuman)
- Groom Plugin enabled (`Edit → Plugins → Groom ✓`)
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

## Level setup for Phase 2

In addition to Phase 1 actors, add to your level:

### Zone actors (one per physical zone)
Place **AZoneController** ×5, set `ZoneId` in Details:
- `ZoneId = Intake`      → set `AgentId = fetch_agent`
- `ZoneId = Transform`   → set `AgentId = normalize_agent`
- `ZoneId = Validation`  → set `AgentId = quality_agent`
- `ZoneId = Corridor`    → no AgentId (responds to global events)
- `ZoneId = Mezzanine`   → no AgentId

For each AZoneController assign:
- `ZoneMPC` → drag in `MPC_ZoneEmissives` asset (create in Content Browser)
- `MPC_IntensityParam` → e.g. `Fetch_ChannelIntensity`
- `MPC_ColorParam`     → e.g. `Fetch_EmissiveColor`
- `MPC_AmbientParam`   → e.g. `Fetch_ZoneAmbientIntensity`

### Global orchestrator
Place **ALightOrchestrator** ×1:
- `SceneSkyLight`        → drag in the level SkyLight
- `SceneDirectionalLight`→ drag in the level DirectionalLight
- `GlobalMPC`            → drag in `MPC_GlobalEmissives` asset

### Task flow splines
Place **ATaskFlowSplineManager** ×1.
In the viewport, select the 4 pre-created spline components and drag their control points to connect zones:
- `Spline_IntakeToTransform`     → Intake zone → Transform zone
- `Spline_TransformToValidation` → Transform → Validation
- `Spline_ValidationToCorridor`  → Validation → Corridor
- `Spline_ValidationRetry`       → Validation → Transform (retry route)

Set `DataPacketClass` to `BP_DataPacket` (create Blueprint subclass of `ADataPacket`).

### Placeholder agents
Place **ASwarmAgentPawn** ×3, set `AgentId` to match backend IDs:
- `AgentId = fetch_agent`     → position in Intake zone
- `AgentId = normalize_agent` → position in Transform zone
- `AgentId = quality_agent`   → position in Validation zone

Assign a skeletal mesh (Mannequin or any placeholder) to the `Mesh` component.

### HUD
Create Blueprint subclasses of each widget class and add to a WBP_HUDRoot:
- `USwarmHUDBase`         → base (abstract, do not place directly)
- `USwarmHUDRoot`         → WBP_HUDRoot — add to viewport from GameMode/HUD
- `UPipelineStatusPanel`  → WBP_PipelineStatusPanel
- `UEventLogPanel`        → WBP_EventLog
- `UQualityScoreDisplay`  → WBP_QualityScoreDisplay
- `UAlertPanel`           → WBP_AlertPanel

Add `WBP_HUDRoot` to viewport in `ASwarmGameMode::BeginPlay` or Level Blueprint.

## Running Phase 2 test scenarios

All scenarios are CallInEditor buttons on **ASwarmTestInjector** Details panel:

| Button | What it tests |
|---|---|
| `RunDemoSequence` | Full 23-event sequence with retry (Phase 1) |
| `RunScenario_CleanSuccess` | Clean pass, quality=95, no retries |
| `RunScenario_HardFail` | normalize_agent fails → SWARM_FAILED |
| `RunScenario_RetryLoop` | Quality fails 3×, passes on attempt 4 at 82 |
| `RunScenario_Anomaly` | Mid-swarm anomaly, continues to degraded success |
| `RunScenario_Idle` | Agents spawn into idle — tests zone Idle lighting |

Watch for:
- Zone lights transitioning through Dark → Idle → Active → Handoff → Success/Failed/Retry
- Data packet actors travelling along splines between zones
- Alert overlay appearing on Anomaly and SwarmFailed events
- Quality score display animating to target values
- Pipeline status panel updating per-agent state

## Level setup for Phase 3

In addition to Phase 2 actors, add to your level:

### MetaHuman agents (replace ASwarmAgentPawn)
Create Blueprint subclasses of **ASwarmMetaHumanAgent** (e.g. `BP_Agent_Fetch`):
1. In the BP, set `BodyMesh` asset to your MetaHuman body skeletal mesh
2. Set `FaceMesh` asset to the MetaHuman face skeletal mesh
3. Attach a `UGroomComponent` to `HairRoot` and assign the hair asset
4. Set `AgentId` to match backend ID (`fetch_agent` / `normalize_agent` / `quality_agent`)
5. Set `WorkstationActor` to the workstation prop in their zone
6. Assign AnimBP that polls `GetAnimState()`, `GetBreathingAmplitude()`, `GetWorkstationIKAlpha()`

### Meta-agent holographic entity
Place **AMetaAgentEntity** ×1 in the Mezzanine zone:
- Assign a sphere/capsule static mesh to `HologramMesh`
- Create `MI_Hologram` dynamic material with `EmissiveColor`, `Opacity`, `ScanlineFlicker` parameters
- Assign Niagara systems to `OrbitFX`, `DataStreamFX`, `PulseFX`
- Entity materializes on SWARM_STARTED automatically

### Cinematic Director (replaces SwarmCameraDirector)
Place **ACinematicDirector** ×1:
- All Phase 1 camera actors remain; Phase 3 director adds per-shot CineCamera settings
- Add **ACineCameraActor** variants named `CineCamera_Fetch`, `CineCamera_Quality`, etc.
  for shots requiring focal length / aperture control
- Add dolly spline actors and name their `USplineComponent` children:
  - `Dolly_CorridorSweep`
  - `Dolly_FetchApproach`
  - `Dolly_QualityReveal`
  - `Dolly_EntryWide`
  - `Dolly_IdleSweep_A`, `Dolly_IdleSweep_B` (add to `IdleDollySplineNames`)

### Atmosphere Controller
Place **AAtmosphereController** ×1:
- `SceneHeightFog` → drag in the level's ExponentialHeightFog actor
- `AtmosphereMPC`  → create `MPC_Atmosphere` in Content Browser with params:
  `Screen_FlickerIntensity`, `Emissive_DriftSpeed`, `Room_HazeIntensity`, `Room_AirDensity`
- Assign Niagara systems to `AmbientDust` and `VolumetricHaze`

### Cinematic Demo Orchestrator
Place **ASwarmDemoOrchestrator** ×1:
- Press `StartCinematicDemo` (CallInEditor) to run the full 12-beat sequence
- `TimingMultiplier = 0.5` for double-speed preview
- `bUseCustomBeats = true` to override with your own beat list

## Running the Phase 3 cinematic demo

Press Play → select **ASwarmDemoOrchestrator** in Outliner → Details → **StartCinematicDemo**

12-beat flow:
| Beat | Name | Duration |
|---|---|---|
| 1 | Operations Floor — Idle | 6s |
| 2 | Swarm Initiated | 7s |
| 3 | fetch_agent — Activating | 5s |
| 4 | Task Flow — Handoff | 8s |
| 5 | normalize_agent — Processing | 5s |
| 6 | Quality Validation | 6s |
| 7 | Failure Detected | 6s |
| 8 | Retry Loop | 10s |
| 9 | Success | 6s |
| 10 | Meta Insight | 5s |
| 11 | Swarm Completed | 10s |
| 12 | Idle Return | 8s |
| **Total** | | **~82s** |

Watch for:
- **Agents**: breathing variation, idle posture shifts, workstation IK, expression micro-cues
- **Meta-agent**: materializing in Mezzanine, orbit FX, pulse on anomaly, dissolving on complete
- **Camera**: focal length changes per shot, dolly moves along splines, focus pulls to subject
- **Atmosphere**: bloom / vignette / chromatic aberration / flicker reacting to swarm events
- **Zones**: full 7-state lighting + MPC emissive surface drive + data packets on splines
- **HUD**: alert overlay, quality score animation, event log filling, pipeline progress bar

## File map

| File | Purpose |
|---|---|
| `Public/Data/SwarmEventTypes.h` | All enums: ESwarmEventType, EAgentVisualState, EEventPriority |
| `Public/Data/SwarmEvent.h` | FSwarmEvent, FQueuedEvent, FAgentStateRecord structs |
| `Public/Subsystems/SwarmEventRouterSubsystem.h` | Core subsystem header |
| `Private/Subsystems/SwarmEventRouterSubsystem.cpp` | WebSocket, parser, queue, state machine |
| `Public/Agents/SwarmTestInjector.h` | Test injection actor (Phase 1 + Phase 2 scenarios) |
| `Private/Agents/SwarmTestInjector.cpp` | Demo sequence, 5× Phase 2 CallInEditor scenarios |
| `Public/Agents/SwarmEventVisualizer.h` | Phase 1 visual proof — colored light per agent |
| `Private/Agents/SwarmEventVisualizer.cpp` | Color tables, light + text update |
| `Public/Agents/SwarmAgentPawn.h` | Placeholder agent pawn — 6 anim states |
| `Private/Agents/SwarmAgentPawn.cpp` | Status light, WorkFX, state→light mapping |
| `Public/Camera/SwarmCameraDirector.h` | Camera director |
| `Private/Camera/SwarmCameraDirector.cpp` | Event → camera switching |
| `Public/Environment/ZoneTypes.h` | EZoneId, EZoneState, FZoneColors, FZoneTransitionParams |
| `Private/Environment/ZoneTypes.cpp` | FZoneColors::ForZone — per-zone identity palettes |
| `Public/Environment/ZoneController.h` | Zone actor — lighting, MPC, FX, state machine |
| `Private/Environment/ZoneController.cpp` | Light interp, pulse, MPC writes, event routing |
| `Public/Lighting/LightOrchestrator.h` | Global light orchestration header |
| `Private/Lighting/LightOrchestrator.cpp` | SkyLight interp, global MPC, alert pulse, zone broadcast |
| `Public/Tasks/DataPacket.h` | Spline-travelling data packet actor |
| `Private/Tasks/DataPacket.cpp` | Spline travel, trail FX, arrival FX |
| `Public/Tasks/TaskFlowSplineManager.h` | Spline route manager |
| `Private/Tasks/TaskFlowSplineManager.cpp` | Route registry, packet spawning, event→route mapping |
| `Public/HUD/SwarmHUDBase.h` | Base widget — auto-subscribes to router |
| `Private/HUD/SwarmHUDBase.cpp` | Delegate forwarding, utility color/label functions |
| `Public/HUD/SwarmHUDRoot.h` | Root HUD widget |
| `Private/HUD/SwarmHUDRoot.cpp` | Cinematic mode toggle |
| `Public/HUD/PipelineStatusPanel.h` | 3-agent pipeline status panel |
| `Private/HUD/PipelineStatusPanel.cpp` | Agent status model, pipeline progress |
| `Public/HUD/EventLogPanel.h` | Scrolling event log — ring buffer |
| `Private/HUD/EventLogPanel.cpp` | Priority filter, summary string builder |
| `Public/HUD/QualityScoreDisplay.h` | Animated quality score widget |
| `Private/HUD/QualityScoreDisplay.cpp` | Lerped display value, color band thresholds |
| `Public/HUD/AlertPanel.h` | Alert overlay widget |
| `Private/HUD/AlertPanel.cpp` | Auto-dismiss timer, alert history |
