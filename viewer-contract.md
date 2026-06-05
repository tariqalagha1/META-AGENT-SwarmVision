# Viewer Contract

## Scope
- Applies to the SwarmVision viewer shell and map surfaces in `apps/frontend`.
- Freeze target is the release-quality command-center viewer at visual score `90/100`.

## Panel Ownership
- `Observe` owns `SystemGraphPanel`, `AgentEcosystemPanel`, `AlertsPanel`, `DiagnosticsPanel`, `DecisionPanel`, `LiveTaskStreamPanel`, `FinalOutputPanel`, `ExecutionNarrative`, `FailureCauseCard`, `IntelligenceDataPanel`, and `ExecutionTimelinePanel`.
- `Visualize` may reuse existing observability panels as companions, but does not own their data or state contracts.
- `Command` may reuse existing observability panels as executive status surfaces, but does not own their data or state contracts.

## Store Ownership
- `src/store/*` remains the sole owner of observability, replay, truth, and runtime state.
- Viewer shell files must not take over or duplicate state ownership.
- New UI work must consume existing selectors, stores, and props only.

## Overlay Ownership
- Replay ribbons, truth ribbons, status banners, drawer portals, and graph controls remain owned by their existing components.
- Shell composition may frame overlays visually, but may not replace or absorb their logic.

## Graph Ownership
- `SystemGraphPanel`, `BaseGraphView`, `ObservabilityGraph`, `SwarmDAG`, and `PixelSim` own map presentation.
- ReactFlow and Pixi behavior, pan, zoom, fitView, replay visibility, and selection flow remain under current graph implementations.
- No shell or panel file may introduce alternative map engines or parallel graph state.

## Allowed Changes
- Bug fixes that preserve visual contract and component ownership.
- Accessibility improvements.
- Performance tuning that does not alter shell hierarchy or map behavior.
- Documentation, baseline refreshes, and regression harness updates after approved review.

## Forbidden Changes
- Rewriting store ownership.
- Changing websocket or transport behavior.
- Rewriting replay or truth routing.
- Moving panel ownership into new containers with new state.
- Replacing ReactFlow or Pixi with another rendering path.
- Changing shell zone proportions or theme primitives without explicit release approval.
- Adding new controls, overlays, map data, or business logic under the viewer freeze.

## Release Review Trigger
- Any change touching `TopCommandBar`, `LeftRail`, `CenterMap`, `RightRail`, `BottomDock`, or command-center theme variables requires screenshot refresh and contract review.
