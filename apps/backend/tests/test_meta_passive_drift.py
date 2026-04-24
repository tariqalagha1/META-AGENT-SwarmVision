from __future__ import annotations

from pathlib import Path


def test_no_outbound_main_backend_client_in_meta_sidecar():
    repo_root = Path(__file__).resolve().parents[3]
    forbidden = repo_root / 'services' / 'meta-agent' / 'app' / 'clients' / 'main_backend_client.py'
    assert forbidden.exists() is False


def test_meta_routes_passive_surface_only():
    repo_root = Path(__file__).resolve().parents[3]
    routes_file = repo_root / 'services' / 'meta-agent' / 'app' / 'api' / 'routes.py'
    text = routes_file.read_text(encoding='utf-8')

    assert "@router.post('/analyze')" in text
    assert "@router.put(" not in text
    assert "@router.delete(" not in text


def test_no_outbound_to_main_backend_from_meta_code():
    repo_root = Path(__file__).resolve().parents[3]
    meta_dir = repo_root / 'services' / 'meta-agent' / 'app'
    text = '\n'.join(path.read_text(encoding='utf-8') for path in meta_dir.rglob('*.py'))

    forbidden_targets = ['swarmvision-backend', 'localhost:8000', '/events/broadcast']
    assert all(target not in text for target in forbidden_targets)
