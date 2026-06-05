"""Authentication, authorization, and tenant-scope helpers."""

from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Iterable

import jwt
from fastapi import HTTPException, Request, WebSocket, status

ROLE_SUPER_ADMIN = "SuperAdmin"
ROLE_TENANT_ADMIN = "TenantAdmin"
ROLE_MANAGER = "Manager"
ROLE_USER = "User"
ROLE_READ_ONLY = "ReadOnly"

ALLOWED_ROLES = {
    ROLE_SUPER_ADMIN,
    ROLE_TENANT_ADMIN,
    ROLE_MANAGER,
    ROLE_USER,
    ROLE_READ_ONLY,
}


@dataclass(frozen=True)
class AuthContext:
    subject: str
    role: str
    tenant_id: str | None


def auth_disabled() -> bool:
    return os.getenv("AUTH_DISABLED", "false").lower() == "true"


def _jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET", "")
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT secret is not configured",
        )
    return secret


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def _extract_bearer_from_request(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    return header[7:]


def _extract_bearer_from_websocket(websocket: WebSocket) -> str:
    header = websocket.headers.get("authorization", "")
    if header.startswith("Bearer "):
        return header[7:]
    query_token = websocket.query_params.get("token")
    if query_token:
        return query_token
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing bearer token",
    )


def build_auth_context(payload: dict) -> AuthContext:
    subject = str(payload.get("sub") or payload.get("user_id") or payload.get("viewer_id") or "")
    role = str(payload.get("role") or "")
    tenant_id = payload.get("tenant_id")
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid role",
        )
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )
    return AuthContext(subject=subject, role=role, tenant_id=str(tenant_id) if tenant_id else None)


def authenticate_request(request: Request) -> AuthContext | None:
    if auth_disabled():
        return None
    payload = _decode_token(_extract_bearer_from_request(request))
    return build_auth_context(payload)


def authenticate_websocket(websocket: WebSocket) -> AuthContext | None:
    if auth_disabled():
        return None
    payload = _decode_token(_extract_bearer_from_websocket(websocket))
    return build_auth_context(payload)


def enforce_role(auth: AuthContext | None, allowed: Iterable[str]) -> None:
    if auth_disabled():
        return
    if auth is None or auth.role not in set(allowed):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient role",
        )


def enforce_tenant_scope(auth: AuthContext | None, tenant_id: str | None) -> None:
    if auth_disabled():
        return
    if not auth:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )
    if auth.role == ROLE_SUPER_ADMIN:
        return
    if not auth.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token missing tenant scope",
        )
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant scope required",
        )
    if auth.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant scope violation",
        )
