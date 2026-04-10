# SwarmVision Graph - Agent Guidelines

## Project Mission

**Project: SwarmVision Graph**

**Mission:** Build a real-time webapp layer that visualizes all AI agents working live.

**Core Requirements:**
- Live agent status monitoring
- Pipeline flow direction visualization
- Graph relationships mapping
- Task execution mapping
- Failure monitoring and alerts
- WebSocket-based real-time updates

**Development Principles:**
- Never break working architecture
- Always extend safely
- Maintain clean separation between product code and external references

## Architecture Boundaries

As an AI agent working on SwarmVision Graph, you must adhere to strict architectural boundaries to maintain code quality and repository integrity.

### External Reference Repositories

The following repositories are cloned as sibling folders and serve **only as references**:

- `langgraph-reference` - LangGraph implementation reference
- `react-force-graph-reference` - React Force Graph implementation reference

### Critical Rules

1. **DO NOT copy code** from external reference repositories into the main `swarmvision-graph` repository
2. **DO NOT merge** external repositories into the main project folder
3. **DO NOT import** or reference external repository source files directly
4. Keep the main repository clean and owned by our product only

### Proper Usage of External References

- Use external repos to understand API patterns and architectural approaches
- Reference documentation and API specifications from external repos
- Implement our own versions of similar functionality using external repos as inspiration
- Document architectural decisions based on external reference patterns

### Multi-Root Workspace

The project is designed to work in a VS Code multi-root workspace that includes:
- Main product repository (`swarmvision-graph`)
- External reference repositories (read-only)

This setup allows you to:
- View external reference code for understanding
- Maintain clean separation between our code and external dependencies
- Use VS Code's cross-workspace search and navigation features

### Development Workflow

1. Study external reference implementations for patterns and APIs
2. Implement our own solutions in the main repository
3. Document architectural decisions and external influences
4. Keep all product code within the `swarmvision-graph` folder structure

### Codex Extension Support

This workspace structure is optimized for Codex extension workflows, providing clean separation between product code and reference materials while maintaining efficient development workflows.