# Follow-up Queue

This file is the parking lot for drift, bugs, or improvements noticed during
work sessions but kept out of scope to prevent scope creep.

## Format

Every item is a small, self-contained entry. Items are NOT a to-do list for
the current session — they belong to a future session.

### Entry template

```
## [YYYY-MM-DD HH:MM] [short title]
- File: [path:line if applicable]
- Observation: [one sentence]
- Priority estimate: [P2 / P3]
- Discovered while: [which work item was in progress]
- Effort estimate: [trivial / small / medium]
```

---

## Queue

(The autonomous agent will append entries below this line. This section may
be empty after a clean session — that's fine.)

## [2026-04-22 08:37] Phase 5–8 frontend tests misaligned with current App.tsx architecture

- Files: `apps/frontend/src/App.phase5.test.tsx`, `App.phase6.test.tsx`, `App.phase7.test.tsx`, `App.phase8.test.tsx`
- Observation: All 4 tests assert DOM structure from the pre-observability 429-line App.tsx ("2D Control View", "Live Mode", "Replay Mode", `data-testid="app-scope-bar"`). Current working-copy App.tsx is 204 lines with the new observability architecture and does not include these elements. Working-copy App.tsx has not been committed since `971b40b` (initial commit).
- Priority estimate: P2
- Discovered while: Pre-Phase-2 test diagnostic (Checkpoint 1 validation)
- Effort estimate: medium — requires either (a) committing the working-copy App.tsx and rewriting the 4 tests against the new architecture, or (b) deleting the 4 phase tests if they're no longer meaningful and replacing with targeted unit tests per observability component
- Recommended session: dedicated frontend test consolidation session, after META-02 is built
