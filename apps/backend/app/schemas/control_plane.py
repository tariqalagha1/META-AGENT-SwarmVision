"""Enterprise SaaS control-plane schemas."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class SubscriptionPlan(str, Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class OrganizationStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    TRIAL = "trial"


class UserRole(str, Enum):
    ADMIN = "admin"
    DEVELOPER = "developer"
    VIEWER = "viewer"
    ANALYST = "analyst"


class OrganizationCreateRequest(BaseModel):
    organization_id: str
    organization_name: str
    subscription_plan: SubscriptionPlan = SubscriptionPlan.FREE
    status: OrganizationStatus = OrganizationStatus.ACTIVE


class ProjectCreateRequest(BaseModel):
    project_id: str
    organization_id: str
    project_name: str
    description: str = ""
    status: str = "active"


class UserCreateRequest(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: UserRole
    organization_id: str


class UserRoleAssignRequest(BaseModel):
    role: UserRole


class TenantBindingRequest(BaseModel):
    tenant_id: str
    organization_id: str
    project_id: Optional[str] = None
    app_id: Optional[str] = None
    app_name: Optional[str] = None


class OrganizationRecord(BaseModel):
    organization_id: str
    organization_name: str
    subscription_plan: str
    status: str
    created_at: datetime


class ProjectRecord(BaseModel):
    project_id: str
    organization_id: str
    project_name: str
    description: str = ""
    status: str = "active"
    created_at: datetime


class UserRecord(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: UserRole
    organization_id: str
    created_at: datetime


class AuditLogRecord(BaseModel):
    audit_id: str
    action: str
    status: str
    user_id: str
    role: str
    organization_id: Optional[str] = None
    project_id: Optional[str] = None
    tenant_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime


class UsageRecord(BaseModel):
    metric: str
    scope_type: str
    scope_key: str
    count: int
    day: str
    updated_at: datetime


class RBACCheckResponse(BaseModel):
    allowed: bool
    permission: str
    role: str


class PermissionDeniedResponse(BaseModel):
    detail: str
    permission: str
    role: str
