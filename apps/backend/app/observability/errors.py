"""Normalized failure metadata for structured logging."""

from __future__ import annotations

from typing import Any


def normalize_error(exc: Exception) -> dict[str, Any]:
    message = str(exc)
    exc_name = exc.__class__.__name__
    lower_msg = message.lower()

    if isinstance(exc, TimeoutError) or "timeout" in lower_msg:
        error_type = "TIMEOUT"
        severity = "MEDIUM"
        recoverable = True
    elif isinstance(exc, ValueError) or "invalid" in lower_msg:
        error_type = "INVALID_OUTPUT"
        severity = "LOW"
        recoverable = True
    else:
        error_type = "SYSTEM_ERROR"
        severity = "HIGH"
        recoverable = False

    return {
        "error_type": error_type,
        "severity": severity,
        "recoverable": recoverable,
        "exception_class": exc_name,
        "message": message,
    }
