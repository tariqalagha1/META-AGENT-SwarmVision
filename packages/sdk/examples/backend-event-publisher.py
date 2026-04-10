import json
import urllib.request


payload = {
    "type": "TASK_FAIL",
    "timestamp": "2026-04-10T19:00:00Z",
    "source": "backend-job",
    "payload": {
        "agent_id": "invoice-worker",
        "task_id": "invoice-run-2026-04-10",
        "task": "Generate invoices",
        "error": "downstream timeout",
    },
    "context": {
        "tenant_id": "tenant-acme",
        "app_id": "billing-api",
        "app_name": "Billing API",
        "environment": "production",
        "version": "5.4.0",
    },
}

request = urllib.request.Request(
    "http://localhost:8012/events/broadcast",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

with urllib.request.urlopen(request) as response:
    print(response.read().decode("utf-8"))
