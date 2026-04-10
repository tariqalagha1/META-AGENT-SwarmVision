# SwarmVision Graph - Architecture

## System Overview

SwarmVision Graph is a real-time web-based observability layer that visualizes AI agents and their interactions. The system consists of frontend and backend components working together to provide live monitoring and visualization.

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (React + Vite)                 │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Components │  │    Hooks     │  │    Store     │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│         ▲                                       ▲         │
│         │        WebSocket Connection          │         │
│         └───────────────────┬────────────────────┘         │
└─────────────────────────────┼──────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  WebSocket (WS)   │
                    │  Event Streaming  │
                    └─────────┬─────────┘
                              │
┌─────────────────────────────┼──────────────────────────────┐
│                    Backend (FastAPI)                      │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ WebSocket    │  │ Event        │  │ Neo4j        │   │
│  │ Manager      │  │ Schemas      │  │ Integration  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│         ▲                                       ▲         │
│         │           HTTP/Event Bus              │         │
│         └───────────────────────┬────────────────┘         │
└─────────────────────────────────┼──────────────────────────┘
                                  │
                    ┌─────────────▼──────────┐
                    │   External Services     │
                    │   - Neo4j Database      │
                    │   - External APIs       │
                    └─────────────────────────┘
```

## Component Architecture

### Frontend (`apps/frontend`)

**Technology Stack:**
- React 18 with TypeScript
- Vite build system
- CSS for styling

**Key Components:**
- `App.tsx` - Main application container
- `components/graph/` - Graph visualization (placeholder)
- `components/agents/` - Agent display components (placeholder)
- `components/websocket/` - WebSocket event handling (placeholder)
- `hooks/` - Custom React hooks (placeholder)
- `store/` - State management (placeholder)
- `types/` - TypeScript type definitions

**Current Status:**
- Initial UI showing system status and event log
- Ready for WebSocket integration

### Backend (`apps/backend`)

**Technology Stack:**
- FastAPI for HTTP/WebSocket APIs
- Pydantic for data validation
- Neo4j driver for graph database
- Uvicorn ASGI server

**Key Modules:**
- `app/main.py` - Main FastAPI application
- `app/websocket/manager.py` - WebSocket connection management
- `app/schemas/event.py` - Event data models
- `app/core/` - Configuration and utilities (placeholder)
- `app/agents/` - Agent management (placeholder)
- `app/neo4j/` - Graph database integration (placeholder)

**Current Status:**
- Health endpoint working
- WebSocket server ready
- Event schema foundation in place

### Shared Packages

**Shared Types (`packages/shared-types`)**
- TypeScript interfaces for all event types
- Enums for agent and task states
- Ensures type safety across frontend and backend

**SDK (`packages/sdk`)**
- `EventEmitter` - Event handling system
- `WebSocketConnector` - WebSocket client
- Public API for third-party integration

## Data Flow

### Real-time Event Flow

```
External Event Source
        │
        ▼
Backend Event Handler
        │
        ├─ Validate (Pydantic Schema)
        ├─ Store (Neo4j)
        └─ Broadcast via WebSocket
                │
                ▼
        Frontend WebSocket Listener
                │
                ├─ Update State
                ├─ Trigger Re-render
                └─ Update UI
                        │
                        ▼
                    User sees live updates
```

## Event Types

| Event | Source | Purpose |
|-------|--------|---------|
| `AGENT_SPAWN` | System | New agent created |
| `AGENT_MOVE` | Agent | Agent moved in pipeline |
| `TASK_START` | Agent | Task execution started |
| `TASK_HANDOFF` | Agent | Task passed to another agent |
| `TASK_SUCCESS` | Agent | Task completed |
| `TASK_FAIL` | Agent | Task failed |
| `PIPELINE_UPDATE` | System | Pipeline state changed |
| `HEALTH_CHECK` | System | System health status |

## API Endpoints

### REST Endpoints

```
GET  /health
     Response: { "status": "ok", "service": "...", "version": "..." }

POST /events/broadcast
     Body: Event object
     Response: { "message": "...", "event": {...} }
```

### WebSocket Endpoints

```
WS /ws/events
   - Receives: Event objects in JSON format
   - Sends: Event updates in real-time
   - Keeps alive: Ping/pong messages
```

## Phase Implementation Plan

### Phase 1: Scaffolding (Current) ✅
- [x] Project structure created
- [x] Frontend runnable with placeholder UI
- [x] Backend health endpoint working
- [x] WebSocket server ready
- [x] Event schemas defined

### Phase 2: WebSocket Pulse
- [ ] Frontend WebSocket connection
- [ ] Real-time event receiving
- [ ] Event log display
- [ ] Connection status indicator

### Phase 3: Graph Visualization
- [ ] React Force Graph integration
- [ ] Agent node rendering
- [ ] Edge/relationship rendering
- [ ] Interactive zoom/pan

### Phase 4: Neo4j Integration
- [ ] Graph database connection
- [ ] Store agent relationships
- [ ] Query graph structure
- [ ] Persist event history

### Phase 5: Advanced Features
- [ ] Advanced visualization filters
- [ ] Agent history timeline
- [ ] Performance metrics
- [ ] System analytics

## Database Schema (Neo4j)

**Planned Structure:**

```cypher
// Nodes
CREATE (:Agent { id, name, type, state })
CREATE (:Task { id, name, state, assigned_to })
CREATE (:Pipeline { id, name })

// Relationships
(Agent)-[:EXECUTES]->(Task)
(Agent)-[:CONNECTED_TO]->(Agent)
(Task)-[:PART_OF]->(Pipeline)
(Pipeline)-[:CONTAINS]->(Agent)
```

## Performance Considerations

### Frontend
- Lazy component loading
- Memoized components to prevent unnecessary re-renders
- Virtual scrolling for large event logs

### Backend
- Connection pooling for database
- Event batching for efficiency
- Memory-efficient WebSocket broadcasting

### Network
- Message compression for large events
- Heartbeat mechanism to detect connection loss
- Automatic reconnection with exponential backoff

## Security (Future)

- [ ] Authentication/Authorization
- [ ] Rate limiting
- [ ] Input validation
- [ ] API key management
- [ ] HTTPS/WSS support
