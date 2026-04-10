# Phase 2: WebSocket Pulse & Live Event Streaming

## Quick Start Guide

### Prerequisites

- Node.js >= 18.0.0
- Python >= 3.10
- Two terminal windows

---

## Backend Setup & Run

### Step 1: Install Python Dependencies

```bash
cd apps/backend
pip install -r requirements.txt
```

### Step 2: Start Backend Server

```bash
cd apps/backend
python -m app.main
```

**Expected Output:**
```
2024-XX-XX 12:00:00 - app.main - INFO - 🚀 SwarmVision Graph backend starting up...
2024-XX-XX 12:00:00 - app.core.pulse - INFO - Event pulse emitter started (interval: 2s)
2024-XX-XX 12:00:00 - uvicorn.server - INFO - Application startup complete [uvicorn]
2024-XX-XX 12:00:00 - uvicorn.server - INFO - Uvicorn running on http://0.0.0.0:8000
```

### Backend Endpoints

- **Health Check**: `GET http://localhost:8000/health`
  ```json
  {
    "status": "ok",
    "service": "SwarmVision Graph API",
    "version": "0.1.0",
    "websocket_connections": 0,
    "pulse_emitter_active": true
  }
  ```

- **WebSocket Events**: `WS ws://localhost:8000/ws/events`
  - Receives real-time events from pulse emitter
  - Broadcasts to all connected clients

- **WebSocket Stats**: `GET http://localhost:8000/ws/stats`
  ```json
  {
    "timestamp": "2024-XX-XXTXX:XX:XX.XXXXXX",
    "active_connections": 1,
    "total_events_broadcast": 45,
    "connections": [
      {
        "id": 0,
        "connected_at": "2024-XX-XXTXX:XX:XX.XXXXXX",
        "events_received": 45
      }
    ]
  }
  ```

---

## Frontend Setup & Run

### Step 1: Install Dependencies

```bash
cd apps/frontend
npm install
```

### Step 2: Start Development Server

```bash
cd apps/frontend
npm run dev
```

**Expected Output:**
```
  VITE v5.0.0  ready in XXXms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

Browser opens at `http://localhost:5173/`

---

## UI State After Successful Setup

### Initial State (Before Connection)
```
SwarmVision OS Layer
Real-time AI Agent Visualization & Monitoring

[Connect] [Disconnect (disabled)]

Connection Status:
  ○ Disconnected
  Events: 0
  Reconnect Attempts: 0

Live Event Stream
  Waiting for events...

Active Swarm Feed:
  👁️ Waiting for live swarm events...
  Connect to backend to start receiving events
```

### Connected State (WebSocket Open)
```
SwarmVision OS Layer
Real-time AI Agent Visualization & Monitoring

[Connect (disabled)] [Disconnect]

Connection Status:
  ● Connected
  Events: 42
  Reconnect Attempts: 0
  Last Event: AGENT_MOVE (12:34:56)

Live Event Stream
  [47 events]
  
  AGENT_SPAWN | system | 12:34:50
    {
      "agent": {
        "id": "abc123",
        "name": "Agent-abc123",
        "type": "processor",
        "state": "ACTIVE",
        ...
      }
    }
  
  TASK_START | agent | 12:34:52
    {
      "task": {
        "id": "task-xyz",
        ...
      },
      "agent_id": "agent-1"
    }

Active Swarm Feed:
  AGENT_SPAWN | system | 12:34:58
  TASK_START | agent | 12:34:59
  AGENT_MOVE | system | 12:35:00
  TASK_HANDOFF | agent | 12:35:01
  TASK_SUCCESS | agent | 12:35:02
```

---

## Sample Event Payload

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "AGENT_SPAWN",
  "timestamp": "2024-04-10T12:34:50.123456",
  "source": "system",
  "payload": {
    "agent": {
      "id": "abc12def",
      "name": "Agent-abc12def",
      "type": "analyzer",
      "state": "ACTIVE",
      "metadata": {
        "created_at": "2024-04-10T12:34:50.123456"
      }
    }
  }
}
```

---

## Proving End-to-End Flow

### Sequence to Verify (Step by Step)

1. **Backend Ready**
   ```bash
   ✓ Backend server running on http://0.0.0.0:8000
   ✓ Health endpoint returns 200
   ✓ Pulse emitter active and emitting events
   ```

2. **Frontend Ready**
   ```bash
   ✓ Frontend dev server running on http://localhost:5173
   ✓ App loads without errors
   ✓ Connection buttons visible
   ```

3. **Connect Frontend to Backend**
   - Open frontend in browser
   - Click "Connect" button
   - Status indicator changes to green (●)

4. **Live Events Flow**
   - Events appear in "Live Event Stream" panel
   - Event counter increments
   - "Active Swarm Feed" shows latest 10 events
   - New events are highlighted with animation

5. **Verify Statistics**
   - Visit `http://localhost:8000/ws/stats`
   - Verify `active_connections` shows 1
   - Verify `total_events_broadcast` keeps increasing

6. **Test Disconnect/Reconnect**
   - Click "Disconnect" button
   - Status changes to red (○)
   - Click "Connect" button
   - Auto-reconnects successfully
   - Events resume

---

## Event Types Emitted

The pulse emitter randomly emits these event types:

| Event Type | Frequency | Purpose |
|------------|-----------|---------|
| `AGENT_SPAWN` | 20% | New agent created |
| `TASK_START` | 20% | Task execution started |
| `AGENT_MOVE` | 20% | Agent moved in pipeline |
| `TASK_HANDOFF` | 20% | Task handed off between agents |
| `TASK_SUCCESS` | 20% | Task completed successfully |

Initial events:
- `HEALTH_CHECK` - System startup health status
- `CONNECTION_ESTABLISHED` - Sent to each new client upon connection

---

## Troubleshooting

### Frontend Cannot Connect to Backend

**Issue:** WebSocket connection refused
```
Error: Failed to create WebSocket connection
```

**Solution:**
1. Verify backend is running on port 8000
2. Check firewall settings
3. Verify URL is `ws://localhost:8000/ws/events` (not `wss://` or `http://`)
4. Open browser DevTools → Network tab → WS filter to see connection attempts

### Backend Not Emitting Events

**Issue:** Event counter stays at 0
```
No active connections to broadcast to
```

**Solution:**
1. Verify pulse emitter started: Check logs for "Event pulse emitter started"
2. Verify clients connected: Check `/ws/stats` endpoint
3. Verify events are being created: Check logs for "Emitted event:" entries

### High CPU Usage

**Issue:** Excessive events or fast emission

**Solution:**
1. Reduce pulse interval in backend: `pulse_emitter.set_interval(5)` for 5-second intervals
2. Check for connection loops or reconnect storms in browser console

### Memory Running Out

**Issue:** Too many events stored in frontend state

**Solution:**
1. Event log is capped at 100 items by default
2. Older events are automatically removed when limit is reached
3. Can adjust `maxItems` prop in EventLog component

---

## Next Steps (Phase 3)

After verifying Phase 2 works:

1. **Implement Graph Visualization**
   - Integrate React Force Graph
   - Render agent nodes
   - Draw task flow connections

2. **Add Filtering**
   - Filter events by type
   - Filter by agent/task
   - Time range filtering

3. **Store Events**
   - Persist events to session storage
   - Add export functionality

---

## Files Modified/Created in Phase 2

### Backend
- `app/main.py` - Updated with pulse emitter integration
- `app/websocket/manager.py` - Enhanced with tracking and stats
- `app/core/pulse.py` - New pulse event emitter

### Frontend
- `src/App.tsx` - Integrated WebSocket and new panels
- `src/App.css` - Updated layout with panels
- `src/hooks/useWebSocket.ts` - New WebSocket hook
- `src/components/websocket/EventLog.tsx` - Event log component
- `src/components/websocket/EventLog.css` - Event log styling
- `src/components/websocket/ConnectionStatus.tsx` - Connection status component
- `src/components/websocket/ConnectionStatus.css` - Status styling

### Configuration
- Both `hooks/index.ts` and `components/websocket/index.ts` updated with exports
