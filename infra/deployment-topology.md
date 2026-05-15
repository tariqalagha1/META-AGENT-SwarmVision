# SwarmVision — Production Deployment Topology

## Overview

SwarmVision runs as a multi-service stack. A single GPU node streams the UE5 scene
via Pixel Streaming. All viewer browsers connect through a signaling server and
optionally route WebRTC media through a TURN relay.

```
                        ┌─────────────────────────────────────┐
                        │           Viewer Browser             │
                        │  (Chrome / Edge — Pixel Streaming)  │
                        └────────┬──────────────┬─────────────┘
                    HTTPS/WSS    │              │  WebRTC SRTP
                                 ▼              ▼
                        ┌────────────┐   ┌──────────────┐
                        │   nginx    │   │  coturn TURN │
                        │ TLS + Proxy│   │  3478 / 5349 │
                        └──┬──┬──┬──┘   └──────────────┘
              /api/replay  │  │  │ /ws (PS signaling)
              /api/auth    │  │  │
                           ▼  │  ▼
          ┌───────────────────┐ ┌───────────────────────┐
          │   replay-service  │ │  signaling-server      │
          │   :3002 HTTP+WS   │ │  (Epic Games PS 5.4)  │
          │   SQLite on disk  │ │  :80 / :8889           │
          └───────────────────┘ └──────────┬────────────┘
                    ▲                       │ WS :8888 (streamer)
                    │                       ▼
          ┌─────────────────┐   ┌───────────────────────┐
          │  event-relay    │   │   UE5 GPU node         │
          │  :3001 WS       │──▶│   Pixel Streaming      │
          │  4-channel mux  │   │   SwarmVisionCinematic │
          └────────┬────────┘   └───────────────────────┘
                   │
                   │ POST /ingest (batch, X-Internal-Key)
                   ▼
          ┌───────────────────┐
          │  replay-service   │  (same instance — ingest endpoint)
          └───────────────────┘
                   ▲
          JWT /api/auth
          ┌───────────────────┐
          │  auth-gateway     │
          │  :4000            │
          └───────────────────┘

Observability sidecar:
          ┌───────────────────┐   ┌───────────────┐
          │  Prometheus :9090 │──▶│ Grafana :3000  │
          │  scrapes all svcs │   │ /grafana/       │
          └───────────────────┘   └───────────────┘
```

---

## Services

| Service           | Port  | Tech                    | Scaling            |
|-------------------|-------|-------------------------|--------------------|
| ue5-gpu           | 8888  | UE5 5.4, NVIDIA GPU     | 1 per stream       |
| signaling         | 80    | Epic Games PS signaling | 1 (stateful WS)    |
| sfu / coturn      | 3478  | coturn                  | 1–3 (geo-sharded)  |
| event-relay       | 3001  | Node.js TypeScript      | 1–N (stateless)    |
| replay-service    | 3002  | Node.js + SQLite WAL    | 1 (SQLite bound)   |
| auth-gateway      | 4000  | Node.js JWT             | 1–N (stateless)    |
| nginx             | 443   | nginx 1.25              | 1 (or LB)          |
| prometheus        | 9090  | Prometheus              | 1                  |
| grafana           | 3000  | Grafana                 | 1                  |

---

## Data flows

### Live swarm event flow

```
AI backend (Python FastAPI)
  └─ POST ws:// → event-relay :3001
       └─ 4 WS channels (Critical / High / Normal / Ambient)
            ├─ Broadcast → UE5 GPU node (USwarmEventRouterSubsystem)
            └─ Batch POST /ingest → replay-service (persists to SQLite)
```

### Replay flow

```
Viewer browser
  └─ POST /api/replay { swarm_id, viewer_id, mode } → replay-service
       └─ Returns replay_id + bookmarks
  └─ WS /api/replay/ws/:replay_id → replay-service (active replay)
       └─ Send { action: "play" }
       └─ Receive { type: "events", events: [...] } at playback_rate × realtime
  └─ UE5 side: USwarmReplaySubsystem re-injects events into USwarmEventRouterSubsystem
```

### Viewer mode switch (Pixel Streaming data channel)

```
Viewer browser (PS data channel)
  └─ Send { type: "mode_switch", payload: "incident" }
       └─ USwarmPixelStreamingBridge.OnDataChannelMessage()
            └─ UViewerModeController.SetViewerMode(Incident)
                 ├─ ACinematicDirector: auto-camera OFF
                 ├─ USwarmHUDAnimator: telemetry overlays ON
                 └─ ULiveObservabilitySubsystem: anomaly highlighting ON
```

---

## Environment variables (.env)

```env
# Required
JWT_SECRET=<256-bit secret>
INTERNAL_KEY=<internal service shared secret>
ADMIN_API_KEY=<auth gateway admin key>
PUBLIC_IP=<server public IP>

# Optional
CORS_ORIGIN=https://your-domain.com
GRAFANA_PASSWORD=<password>
UE5_IMAGE=swarmvision/ue5-pixelstreaming:latest
RELAY_IMAGE=swarmvision/event-relay:latest
REPLAY_IMAGE=swarmvision/replay-service:latest
AUTH_IMAGE=swarmvision/auth-gateway:latest
```

---

## GPU node requirements

| Spec       | Minimum           | Recommended          |
|------------|-------------------|----------------------|
| GPU        | NVIDIA RTX 3080   | NVIDIA A10G / RTX 4090 |
| VRAM       | 10 GB             | 24 GB                |
| CPU        | 8 cores           | 16 cores             |
| RAM        | 32 GB             | 64 GB                |
| OS         | Ubuntu 22.04      | Ubuntu 22.04         |
| Driver     | 525+              | 545+                 |
| Container  | nvidia-container-toolkit | same          |

---

## Deployment commands

```bash
# Build all service images
docker compose -f docker/docker-compose.production.yml build

# Start stack
docker compose -f docker/docker-compose.production.yml up -d

# Run replay-service migrations
docker compose exec replay-service npm run db:migrate

# Tail logs
docker compose logs -f replay-service event-relay

# Scale event-relay for higher throughput
docker compose up -d --scale event-relay=3
```

---

## Quality tiers and Pixel Streaming bitrates

| Tier       | Lumen | LOD | FPS | Bitrate   | Use case               |
|------------|-------|-----|-----|-----------|------------------------|
| Cinematic  | Full  | 0   | 60  | 15 Mbps   | Executive demo / on-site |
| Standard   | 60%   | 1   | 60  | 8 Mbps    | Remote stakeholder      |
| Cloud      | Off   | 2   | 30  | 4 Mbps    | Low-bandwidth / mobile  |

Tier is set by the viewer browser via Pixel Streaming data channel:
`{ "type": "tier_set", "payload": "standard" }`

---

## Replay storage sizing

SQLite WAL, single file at `/data/replay.db`.

| Swarm size | Est. events | Storage  |
|------------|-------------|----------|
| Small      | 500         | ~2 MB    |
| Typical    | 5,000       | ~18 MB   |
| Large      | 50,000      | ~180 MB  |
| Very large | 500,000     | ~1.8 GB  |

Recommended: mount a dedicated SSD volume, prune sessions older than 90 days.
