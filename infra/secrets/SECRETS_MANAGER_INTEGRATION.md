# Secrets Manager Integration Plan

## Objective
Remove plaintext runtime secret handling and load secrets from a managed secrets backend in production.

## Supported targets
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault

## Required secret set
- `JWT_SECRET`
- `META_SHARED_SECRET`
- `NEO4J_PASSWORD`
- `INTERNAL_KEY`
- `ADMIN_API_KEY`
- `GRAFANA_PASSWORD`

## Contract
Application containers must receive secrets at runtime via environment injection performed by the platform (not committed `.env` files).

## AWS example mapping
Secret name: `swarmvision/prod/core`

```json
{
  "JWT_SECRET": "....",
  "META_SHARED_SECRET": "....",
  "NEO4J_PASSWORD": "....",
  "INTERNAL_KEY": "....",
  "ADMIN_API_KEY": "....",
  "GRAFANA_PASSWORD": "...."
}
```

## Deployment requirements
1. `AUTH_DISABLED=false` in production.
2. Fail deployment if any required secret is missing.
3. Rotate `JWT_SECRET` and service keys on a defined schedule.
4. Audit access to secret read operations.

## Verification checklist
1. Start stack with no local `.env` secrets.
2. Confirm all services pass health checks.
3. Confirm auth-required endpoints reject unauthenticated requests.
4. Confirm logs contain no raw secret values.
