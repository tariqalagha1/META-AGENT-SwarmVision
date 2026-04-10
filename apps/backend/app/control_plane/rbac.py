"""Role-based access control primitives for enterprise SaaS mode."""

PERMISSIONS_BY_ROLE: dict[str, set[str]] = {
    "admin": {
        "org:manage",
        "project:manage",
        "user:manage",
        "tenant:switch",
        "event:publish",
        "replay:read",
        "analytics:read",
        "analytics:export",
        "audit:read",
        "usage:read",
    },
    "developer": {
        "project:manage",
        "tenant:switch",
        "event:publish",
        "replay:read",
        "analytics:read",
    },
    "analyst": {
        "replay:read",
        "analytics:read",
        "analytics:export",
        "usage:read",
    },
    "viewer": {
        "replay:read",
        "analytics:read",
    },
}


def has_permission(role: str, permission: str) -> bool:
    return permission in PERMISSIONS_BY_ROLE.get(role, set())
