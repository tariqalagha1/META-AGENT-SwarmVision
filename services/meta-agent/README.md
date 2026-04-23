# Meta Agent Sidecar

Passive control-plane intelligence service for SwarmVision.

## Guarantees

- Passive mode only (`META_MODE=passive`)
- Read-only analysis from structured context input
- No outbound client to main backend
- No control flow mutation in main system
- Bounded resource consumption with timeout and rate limiting

## API

- `POST /analyze` -> list of `META_INSIGHT`
- `GET /health`
- `GET /version`
- `GET /metrics`
- `GET /insights/recent` only when `META_DEBUG=true`

## Security

- Optional `X-Meta-Token` validation via `META_SHARED_SECRET`
- In production mode (`META_REQUIRE_AUTH_IN_PROD=true`), token required for `/analyze`

## Running

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 9001
```

## Notes

- Sidecar is designed to fail silently from the perspective of main request paths.
- Metrics are Prometheus-only and are not sent back into the main event stream.
