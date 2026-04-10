"""Control-plane RBAC exports."""

from .rbac import PERMISSIONS_BY_ROLE, has_permission

__all__ = ["PERMISSIONS_BY_ROLE", "has_permission"]
