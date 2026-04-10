# Backend Tests

Unit and integration tests for the SwarmVision Graph backend service.

## Test Structure

- API endpoint tests
- WebSocket connection tests
- Event schema validation tests
- Event emitter tests

## Running Tests

```bash
pytest
```

## Running Tests with Coverage

```bash
pytest --cov=app
```

## Running Specific Test File

```bash
pytest tests/backend/test_health.py
```
