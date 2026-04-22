# Escape Hatch Log

This file records any escape-hatch stop conditions that fire during the
autonomous execution session.

## Escape hatch conditions (reference)

1. A test that was not written by the agent starts failing and cannot be
   fixed in under 20 minutes.
2. P0-3 grep reveals Scenario B — production code imports
   `swarmvision_client.py`.
3. A new runtime dependency is required (npm or pip, not dev or type deps).
4. A contract from the audit appears wrong or impossible to meet.
5. A security-sensitive change is encountered beyond session scope.
6. A refactor larger than ~100 LOC outside the audit's fix plan is being
   considered.
7. The session log exceeds 3000 lines.
8. A file outside the 5 audited prompts' scope needs modification.

## Format when a hatch fires

```
## [YYYY-MM-DD HH:MM] Hatch #[N] fired

### What I was doing
[brief context]

### What I found
[file:line, grep output, or failing test — raw evidence]

### Recommendation
[what I think the resolution is]

### State
Session HALTED. Awaiting user input.
```

---

## Log

(Empty if no hatches fire during the session. This is the desired outcome.)
