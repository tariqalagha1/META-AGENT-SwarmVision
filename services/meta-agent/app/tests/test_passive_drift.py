from __future__ import annotations

import pathlib
import re

# META-01 v2 Rule 7: meta-agent must be passive — no outbound HTTP calls to the
# main backend. This test statically verifies no such calls have been introduced.

_AGENT_ROOT = pathlib.Path(__file__).parent.parent

# Patterns that indicate an outbound POST/GET to the main backend
_BACKEND_CALL_PATTERNS = [
    re.compile(r'httpx\.post\s*\('),
    re.compile(r'httpx\.get\s*\('),
    re.compile(r'requests\.post\s*\('),
    re.compile(r'requests\.get\s*\('),
    re.compile(r'aiohttp\.ClientSession'),
    re.compile(r'http[sx]?://.*localhost:8000'),
    re.compile(r'swarmvision_client'),
    re.compile(r'SwarmVisionClient'),
]

_TEST_DIR = _AGENT_ROOT / 'tests'


def _source_files():
    for path in _AGENT_ROOT.rglob('*.py'):
        # Exclude test fixtures — they may set up mock clients for testing
        if path.is_relative_to(_TEST_DIR):
            continue
        yield path


def test_no_outbound_backend_calls_in_production_code():
    violations = []

    for path in _source_files():
        try:
            text = path.read_text(encoding='utf-8')
        except OSError:
            continue

        for pattern in _BACKEND_CALL_PATTERNS:
            for match in pattern.finditer(text):
                line_no = text[: match.start()].count('\n') + 1
                violations.append(f'{path.relative_to(_AGENT_ROOT)}:{line_no} — {match.group()}')

    assert violations == [], (
        'META-01 v2 Rule 7 violation — meta-agent must be passive.\n'
        'Outbound HTTP calls to the main backend detected:\n'
        + '\n'.join(violations)
    )
