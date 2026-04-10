# SwarmVision Graph

A web-based observability layer that acts as a live monitoring and swarm visualization system for other applications.

## Project Purpose

SwarmVision Graph provides real-time visualization and monitoring capabilities for distributed systems, enabling developers and operators to observe and analyze swarm behaviors, application interactions, and system health metrics through an intuitive graph-based interface.

## Workspace Structure

This project uses a multi-root VS Code workspace structure for clean separation of concerns:

```
/workspace
   /swarmvision-graph        ← main product repo
   /langgraph-reference      ← external reference repo
   /react-force-graph-reference ← external reference repo
```

### Main Repository (swarmvision-graph)

The main repository contains our product code organized as a monorepo:

- `apps/frontend/` - React-based web application for visualization
- `apps/backend/` - API server and data processing
- `packages/sdk/` - SDK for integrating with SwarmVision Graph
- `packages/shared-types/` - Shared TypeScript types and interfaces
- `docs/` - Documentation and guides
- `tests/` - Test suites and integration tests

### External Reference Repositories

The external repositories (`langgraph-reference` and `react-force-graph-reference`) are cloned as sibling folders and serve as architectural references only. They are NOT part of our main repository and should never be merged or copied into our codebase.

These repositories provide:
- API patterns and architectural insights
- Implementation examples for graph visualization
- Reference implementations for similar functionality

## How to Open Multi-Root Workspace

1. Open VS Code
2. File → Open Workspace from File...
3. Navigate to the workspace root and select `swarmvision.code-workspace`

This will open all three folders (main repo + references) in a single VS Code instance, allowing you to reference external code while keeping our repository clean.

## Development Setup

1. Clone the external reference repositories:
   ```bash
   git clone https://github.com/langchain-ai/langgraph ../langgraph-reference
   git clone https://github.com/vasturiano/react-force-graph ../react-force-graph-reference
   ```

2. Open the multi-root workspace as described above

3. Install dependencies in the main repo (when package.json is added)

## Architecture Boundaries

- **DO NOT** copy code from external reference repositories into the main repo
- Use external repos only for understanding patterns and APIs
- Keep the main repository isolated and owned by our product only
- Reference external implementations through documentation and API calls, not direct code inclusion