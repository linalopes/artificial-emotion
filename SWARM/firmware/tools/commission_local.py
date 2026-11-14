#!/usr/bin/env python3
"""Local (gitignored) commissioning state: credentials + MAC↔module manifest.

Never print Wi-Fi passwords or auth tokens.
Never commit tools/.local/.
"""

from __future__ import annotations

import json
import os
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

TOOLS_DIR = Path(__file__).resolve().parent
LOCAL_DIR = TOOLS_DIR / ".local"
CREDENTIALS_PATH = LOCAL_DIR / "credentials.json"
MANIFEST_PATH = LOCAL_DIR / "commissioning_manifest.json"
TOKEN_PATH = LOCAL_DIR / "swarm_auth_token"  # legacy single-file token

VALID_IDS = [f"Mau{i:02d}" for i in range(1, 10)]
PROTECTED_ID = "Mau01"


def ensure_local_dir() -> None:
    LOCAL_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)


def _atomic_write_json(path: Path, data: dict[str, Any], *, mode: int = 0o600) -> None:
    ensure_local_dir()
    tmp = path.with_suffix(path.suffix + ".tmp")
    text = json.dumps(data, indent=2, sort_keys=True) + "\n"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.replace(tmp, path)
    os.chmod(path, mode)


def load_credentials() -> dict[str, str]:
    """Return {ssid, wifi_password, auth_token} with empty strings when missing."""
    out = {"ssid": "", "wifi_password": "", "auth_token": ""}
    if CREDENTIALS_PATH.is_file():
        try:
            data = json.loads(CREDENTIALS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                for key in out:
                    val = data.get(key)
                    if isinstance(val, str):
                        out[key] = val
        except (OSError, json.JSONDecodeError):
            pass
    if not out["auth_token"] and TOKEN_PATH.is_file():
        try:
            out["auth_token"] = TOKEN_PATH.read_text(encoding="utf-8").strip()
        except OSError:
            pass
    return out


def save_credentials(*, ssid: str, wifi_password: str, auth_token: str) -> Path:
    ensure_local_dir()
    _atomic_write_json(
        CREDENTIALS_PATH,
        {
            "ssid": ssid,
            "wifi_password": wifi_password,
            "auth_token": auth_token,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        mode=0o600,
    )
    # Keep legacy token file for existing coordinator launch helpers.
    fd = os.open(TOKEN_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(auth_token)
    return CREDENTIALS_PATH


def empty_manifest() -> dict[str, Any]:
    return {
        "version": 1,
        "description": "Local SWARM commissioning manifest (MAC ↔ Mau0N). No secrets.",
        "modules": {},
        "updated_at": None,
    }


def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.is_file():
        return empty_manifest()
    try:
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return empty_manifest()
        data.setdefault("version", 1)
        data.setdefault("modules", {})
        return data
    except (OSError, json.JSONDecodeError):
        return empty_manifest()


def save_manifest(manifest: dict[str, Any]) -> Path:
    manifest = dict(manifest)
    manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
    _atomic_write_json(MANIFEST_PATH, manifest, mode=0o644)
    # Manifest has no secrets; still keep it under .local (gitignored).
    try:
        os.chmod(MANIFEST_PATH, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
    except OSError:
        pass
    return MANIFEST_PATH


def normalize_mac(mac: str) -> str:
    mac = mac.strip().upper().replace("-", ":")
    parts = mac.split(":")
    if len(parts) != 6:
        raise ValueError(f"invalid MAC: {mac!r}")
    return ":".join(p.zfill(2) for p in parts)


def find_module_by_mac(manifest: dict[str, Any], mac: str) -> Optional[str]:
    mac_n = normalize_mac(mac)
    modules = manifest.get("modules") or {}
    for module_id, entry in modules.items():
        if not isinstance(entry, dict):
            continue
        entry_mac = entry.get("mac")
        if isinstance(entry_mac, str) and normalize_mac(entry_mac) == mac_n:
            return str(module_id)
    return None


def assigned_ids(manifest: dict[str, Any]) -> set[str]:
    modules = manifest.get("modules") or {}
    return {mid for mid, entry in modules.items() if isinstance(entry, dict) and entry.get("status") == "ok"}


def next_free_ids(manifest: dict[str, Any]) -> list[str]:
    taken = assigned_ids(manifest)
    return [mid for mid in VALID_IDS if mid not in taken]


def record_success(
    manifest: dict[str, Any],
    *,
    module_id: str,
    mac: str,
    flash_mb: int,
    pio_env: str,
    firmware: str,
    ssid: str,
    coordinator_host: str,
    coordinator_port: int,
    usb_port: str,
    notes: str = "",
) -> dict[str, Any]:
    modules = dict(manifest.get("modules") or {})
    modules[module_id] = {
        "mac": normalize_mac(mac),
        "flash_mb": flash_mb,
        "pio_env": pio_env,
        "firmware": firmware,
        "ssid": ssid,
        "coordinator_host": coordinator_host,
        "coordinator_port": coordinator_port,
        "usb_port_last_seen": usb_port,
        "commissioned_at": datetime.now(timezone.utc).isoformat(),
        "status": "ok",
        "notes": notes,
    }
    manifest["modules"] = modules
    save_manifest(manifest)
    return modules[module_id]


def print_manifest(manifest: dict[str, Any]) -> None:
    modules = manifest.get("modules") or {}
    print("Commissioning manifest (local, gitignored):")
    print(f"  path: {MANIFEST_PATH}")
    if not modules:
        print("  (empty)")
        return
    for mid in VALID_IDS:
        entry = modules.get(mid)
        if not entry:
            print(f"  {mid}: —")
            continue
        print(
            f"  {mid}: mac={entry.get('mac')}  fw={entry.get('firmware')}  "
            f"flash={entry.get('flash_mb')}MB  status={entry.get('status')}"
        )
