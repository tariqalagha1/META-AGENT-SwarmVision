# META-02 v3 — Meta Insights Panel (Calibrated)

**Version**: v3 (calibrated against actual codebase — April 2026)
**Supersedes**: META-02 v2 (which specified a non-existent channel and incompatible layout)
**Audit reference**: `docs/audits/AUDIT_REPORT_2026-04-22.md` — reconciliation items R-06, R-07

---

## Calibration notes (read before implementing)

Two spec errors in META-02 v2 have been corrected here:

1. **Channel**: v2 specified `/stream/insights`. The actual implementation uses the `events`
   WebSocket channel. META_INSIGHT events arrive with `event_type === "META_INSIGHT"` on
   the existing `ws://localhost:8000/ws/events` connection. There is no separate channel.

2. **Layout**: v2 specified a right-column stack with a bottom drawer as a 5th panel.
   The actual layout is a **2×2 grid** (`app-main-layout` CSS class). Adding a 5th quadrant
   would break the layout. MetaInsightsPanel must be implemented as a collapsible bottom
   drawer beneath the 2×2 grid, or as a tab within the DecisionPanel. The 2×2 must be
   preserved.

---

## Context

The SwarmVision frontend (`apps/frontend`) displays real-time observability data from a
multi-agent AI system. The meta-agent sidecar (`services/meta-agent`) runs heuristic analysis
and emits `META_INSIGHT` events when it detects patterns (bottlenecks, repeated failures,
load risk, decision anomalies, anomaly correlation).

As of this prompt, the frontend store (`useObservabilityStore.ts`) indexes META_INSIGHT events
in `insightEvents: string[]` and exposes them via `useMetaInsightEvents()` from `store/index.ts`.
The panel just needs to be built.

---

## What to build

### 1. `metaCategoryTokens.ts`

Location: `apps/frontend/src/design/metaCategoryTokens.ts`

Export a `META_CATEGORY_TOKENS` map keyed by heuristic category string. Categories come from
`services/meta-agent/app/services/heuristics.py` and match these names:

| Category key | Display label | Color token |
|---|---|---|
| `bottleneck` | Bottleneck | `#F59E0B` (amber) |
| `repeated_failure` | Repeated Failure | `#EF4444` (red) |
| `decision_pattern` | Decision Pattern | `#8B5CF6` (violet) |
| `anomaly_correlation` | Anomaly Correlation | `#EC4899` (pink) |
| `load_risk` | Load Risk | `#F97316` (orange) |

Unknown categories fall back to label `"Insight"`, color `#8AA0C0`.

Structure:
```ts
export type MetaCategoryToken = {
  label: string
  color: string
}
export const META_CATEGORY_TOKENS: Record<string, MetaCategoryToken> = { ... }
export const getMetaCategoryToken = (category: string): MetaCategoryToken => ...
```

### 2. `MetaCategoryBadge.tsx`

Location: `apps/frontend/src/components/observability/MetaCategoryBadge.tsx`

A small inline badge: colored dot + label. Props: `{ category: string }`.

```tsx
<span className="meta-category-badge">
  <span className="meta-category-dot" style={{ backgroundColor: token.color }} />
  {token.label}
</span>
```

CSS: add `.meta-category-badge` and `.meta-category-dot` to `App.css` using existing
`--ov-*` custom property conventions.

### 3. `MetaInsightsPanel.tsx`

Location: `apps/frontend/src/components/observability/MetaInsightsPanel.tsx`

**Data source**: `useMetaInsightEvents()` from `store/index.ts`. Do NOT fetch from any HTTP
endpoint — insights arrive via WebSocket and are already in the store.

**Placement**: Collapsible bottom drawer beneath the 2×2 grid. Not a 5th quadrant.

Implement as a `<section>` with:
- `aria-label="Meta insights panel"`
- A toggle button in the header to collapse/expand
- When collapsed: shows only header + count pill
- When expanded: shows a scrollable list of insight cards

Each insight card shows:
- `MetaCategoryBadge` for `payload.category`
- `payload.summary` text (string)
- Affected agents: `payload.affected_agents` (string[], may be absent) — render as comma-separated
- Timestamp (formatted as `HH:MM:SS`)
- Severity badge if `payload.severity` is present (`"LOW"` | `"MEDIUM"` | `"HIGH"`)

Empty state: `"No meta insights yet — analysis begins when events start streaming."`

### 4. Wire into `App.tsx`

Add `MetaInsightsPanel` below the `<main className="app-main-layout">` closing tag, inside
the `.app-shell` wrapper. No layout changes to the 2×2 grid.

```tsx
<div className="app-shell">
  <header className="app-shell-header">...</header>
  <div className="app-channel-strip">...</div>
  <main className="app-main-layout">
    {/* existing 2×2 panels unchanged */}
  </main>
  <MetaInsightsPanel />   {/* ← new */}
</div>
```

---

## Contracts and invariants

- `useMetaInsightEvents()` returns `ObservabilityEvent[]` capped at 500 entries (store-side cap).
  The panel must not re-slice or re-cap — trust the store.
- `payload.category` is always a string but may not match any known key — use `getMetaCategoryToken`
  fallback.
- `payload.affected_agents` is `string[] | undefined` — never assume it exists.
- The panel must NOT make any HTTP calls.
- Do not add a 5th grid cell to `app-main-layout`.
- All new CSS must use the existing `--ov-*` custom properties from `App.css` for colors/spacing.

---

## Testing contract

Write `MetaInsightsPanel.test.tsx` covering:

1. **Empty state**: renders "No meta insights yet" when `insightEvents` is empty.
2. **Populated state**: renders insight cards with correct category badge, summary, and timestamp.
3. **Collapse/expand**: toggle button collapses the panel, re-click expands.
4. **Unknown category fallback**: `category: "unknown_heuristic"` renders the fallback label/color.
5. **Missing optional fields**: renders correctly when `affected_agents` and `severity` are absent.

Use `useMetaInsightEvents` by injecting events into the store via `observabilityStore.getState().addEvent(...)`.

---

## Out of scope for this panel

- Filtering by category or agent (P3 follow-up)
- Pagination (store cap of 500 is sufficient for MVP)
- Clicking through to related events (P3 follow-up)
- HTTP polling fallback (insights are WS-only)
