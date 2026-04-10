# SwarmVision Graph - Setup and Development Guide

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Python >= 3.10
- pip (Python package manager)

### Frontend Setup

```bash
cd apps/frontend
npm install
npm run dev
```

The frontend will start at `http://localhost:5173`

### Backend Setup

```bash
cd apps/backend
pip install -r requirements.txt
python -m app.main
```

The backend API will start at `http://localhost:8000`

Health check endpoint: `http://localhost:8000/health`

### WebSocket Connection

Connect to the WebSocket server at `ws://localhost:8000/ws/events`

## Project Structure

- `apps/frontend/` - React + Vite web application
- `apps/backend/` - FastAPI service with WebSocket support
- `packages/shared-types/` - TypeScript type definitions
- `packages/sdk/` - SDK for integration
- `tests/` - Test suites for frontend and backend
- `docs/` - Documentation

## Available Commands

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run type-check` - Check TypeScript types

### Backend
- `uvicorn app.main:app --reload` - Start dev server with auto-reload
- `uvicorn app.main:app` - Start production server

### SDK & Shared Types
- `npm run build` - Compile TypeScript
- `npm run type-check` - Check types

## API Endpoints

### Health Check
- `GET /health` - Returns service status

### WebSocket
- `WS /ws/events` - Real-time event stream

### Events (Broadcasting)
- `POST /events/broadcast` - Broadcast event to all clients (for testing)

## Environment Configuration

Create `.env` files based on `.env.example`:

### Backend `.env`
```
API_HOST=0.0.0.0
API_PORT=8000
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

## Event Types

The system supports the following event types:

- `AGENT_SPAWN` - New agent created
- `AGENT_MOVE` - Agent moved in pipeline
- `AGENT_TERMINATION` - Agent terminated
- `TASK_START` - Task execution started
- `TASK_HANDOFF` - Task handed off between agents
- `TASK_SUCCESS` - Task completed successfully
- `TASK_FAIL` - Task failed
- `PIPELINE_UPDATE` - Pipeline state changed
- `HEALTH_CHECK` - System health status

## Testing

### Frontend Tests
```bash
cd tests/frontend
npm run test
```

### Backend Tests
```bash
cd tests/backend
pytest
```

## Troubleshooting

### Frontend doesn't connect to backend
- Ensure backend is running on `http://localhost:8000`
- Check browser WebSocket connection in Network tab
- Verify CORS settings in backend

### Backend health check fails
- Ensure backend is running
- Check that port 8000 is not in use
- Review backend logs for errors

### WebSocket connection refused
- Verify backend is running
- Check firewall settings
- Verify correct WebSocket URL format

## Next Steps

After Phase 1 scaffolding:

1. **Phase 2** - WebSocket pulse and real-time event streaming
2. **Phase 3** - Graph visualization and agent rendering
3. **Phase 4** - Neo4j integration for graph storage
4. **Phase 5** - Advanced visualization and filtering
