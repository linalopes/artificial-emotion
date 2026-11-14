#!/usr/bin/env python3
"""Phase C.1 — sequential flash + NVS commissioning for Mau02–Mau09.

Uses the existing firmware binary and Serial CLI. Does not rewrite firmware or
the coordinator. Secrets stay under tools/.local/ (gitignored).

Typical flow:
  python3 tools/commission_next.py status
  python3 tools/commission_next.py inspect
  # disconnect Mau01, connect next blank ESP32, then:
  python3 tools/commission_next.py next
  # or:
  python3 tools/commission_next.py commission --module Mau02

Requires: pyserial. PlatformIO on PATH for flash/chip query.
Never prints Wi-Fi passwords or auth tokens.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional

TOOLS_DIR = Path(__file__).resolve().parent
FIRMWARE_DIR = TOOLS_DIR.parent
sys.path.insert(0, str(TOOLS_DIR))

import commission_local as local  # noqa: E402
from provision_module import (  # noqa: E402
    BAUD,
    DEFAULT_COORD_PORT,
    DEFAULT_SSID,
    SerialSession,
    detect_port,
    extract_status_payloads,
    list_serial_ports,
    mac_lan_ips,
    macos_secure_prompt,
    wifi_command,
)

try:
    import serial
    from serial.tools import list_ports
except ImportError as exc:
    raise SystemExit("Install dependency: pip install pyserial") from exc

PIO = os.path.expanduser("~/.platformio/penv/bin/pio")
ESPTTOOL_VIA_PIO = [PIO, "pkg", "exec", "-p", "tool-esptoolpy", "--", "esptool.py"]
EXPECTED_FIRMWARE = "0.3.1"
COORD_STABLE_S = 30.0


def which_pio() -> str:
    if Path(PIO).is_file():
        return PIO
    found = subprocess.run(["which", "pio"], capture_output=True, text=True)
    if found.returncode == 0 and found.stdout.strip():
        return found.stdout.strip()
    raise SystemExit("PlatformIO `pio` not found. Install PlatformIO Core first.")


def wait_for_port(port: str, timeout: float = 15.0) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if Path(port).exists():
            return port
        time.sleep(0.4)
    # Port path may change after USB re-enumeration (usbmodem101 → usbmodem201)
    alt = detect_port()
    if alt and Path(alt).exists():
        print(f"Port path changed → {alt}")
        return alt
    raise SystemExit(f"Serial port {port} not available (reconnect USB?).")


def run_esptool(port: str, *args: str, timeout: float = 60.0) -> tuple[str, str]:
    """Returns (combined_output, port_used). Retries if the USB device re-enumerates."""
    pio = which_pio()
    last_out = ""
    port_used = port
    for attempt in range(1, 4):
        port_used = wait_for_port(port_used, timeout=12.0)
        cmd = [
            pio,
            "pkg",
            "exec",
            "-p",
            "tool-esptoolpy",
            "--",
            "esptool.py",
            "--port",
            port_used,
            *args,
        ]
        try:
            completed = subprocess.run(
                cmd,
                cwd=str(FIRMWARE_DIR),
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise SystemExit(f"esptool timed out: {' '.join(args)}") from exc
        last_out = (completed.stdout or "") + (completed.stderr or "")
        if completed.returncode == 0:
            # Give CDC a moment after hard_reset
            time.sleep(1.2)
            return last_out, wait_for_port(port_used, timeout=12.0)
        if "port doesn't exist" in last_out or "Could not open" in last_out:
            print(f"  esptool open failed (attempt {attempt}/3); waiting for USB…")
            time.sleep(1.5)
            alt = detect_port()
            if alt:
                port_used = alt
            continue
        break
    raise SystemExit(f"esptool failed:\n{last_out[-2000:]}")


def probe_chip(port: str) -> dict[str, Any]:
    """Read chip type, MAC, flash size. Does not erase NVS."""
    print(f"Probing chip on {port} (read-only)…")
    out, port = run_esptool(port, "flash_id")
    chip = "unknown"
    mac = ""
    flash_mb = 0
    m = re.search(r"Chip is ([^\n]+)", out)
    if m:
        chip = m.group(1).strip()
    m = re.search(r"MAC:\s*([0-9a-fA-F:]{17})", out)
    if m:
        mac = local.normalize_mac(m.group(1))
    m = re.search(r"Detected flash size:\s*(\d+)MB", out, re.I)
    if m:
        flash_mb = int(m.group(1))
    if "ESP32-S3" not in chip:
        raise SystemExit(f"Unexpected chip {chip!r}. Expected ESP32-S3.")
    if not mac:
        raise SystemExit("Could not read MAC from esptool output.")
    if flash_mb not in (4, 8):
        raise SystemExit(f"Unsupported/unknown flash size: {flash_mb}MB (need 4 or 8).")
    pio_env = "swarm_s3_4mb_ota" if flash_mb == 4 else "swarm_s3_8mb_ota"
    info = {
        "chip": chip,
        "mac": mac,
        "flash_mb": flash_mb,
        "pio_env": pio_env,
        "port": port,
        "raw_tail": out[-500:],
    }
    print(f"  chip:     {chip}")
    print(f"  MAC:      {mac}")
    print(f"  flash:    {flash_mb} MB → env {pio_env}")
    print(f"  port:     {port}")
    return info


def firmware_bin_path(pio_env: str) -> Path:
    return FIRMWARE_DIR / ".pio" / "build" / pio_env / "firmware.bin"


def ensure_firmware_built(pio_env: str) -> Path:
    bin_path = firmware_bin_path(pio_env)
    if bin_path.is_file():
        # Confirm version string without rebuilding when possible
        try:
            strings = subprocess.run(
                ["strings", str(bin_path)],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            if "0.3.1" in (strings.stdout or ""):
                print(f"Using existing build: {bin_path}")
                return bin_path
        except (OSError, subprocess.TimeoutExpired):
            pass
    print(f"Building firmware ({pio_env})…")
    pio = which_pio()
    completed = subprocess.run(
        [pio, "run", "-e", pio_env],
        cwd=str(FIRMWARE_DIR),
        text=True,
        check=False,
    )
    if completed.returncode != 0 or not bin_path.is_file():
        raise SystemExit("Firmware build failed.")
    print("Build OK.")
    return bin_path


def flash_firmware(port: str, pio_env: str) -> str:
    """Upload firmware. Retries when USB CDC disappears after esptool probe/reset.

    Returns the port path used for the successful upload (may change after re-enumeration).
    """
    ensure_firmware_built(pio_env)
    pio = which_pio()
    # esptool flash_id / prior reset often bounce the CDC interface — settle first.
    print("Settling USB before upload (post-probe CDC re-enumeration)…")
    time.sleep(3.0)
    port_used = wait_for_port(detect_port() or port, timeout=20.0)
    last_rc = 1
    for attempt in range(1, 6):
        port_used = wait_for_port(detect_port() or port_used, timeout=20.0)
        print(f"Uploading {pio_env} to {port_used} (attempt {attempt}/5)…")
        completed = subprocess.run(
            [pio, "run", "-e", pio_env, "-t", "upload", "--upload-port", port_used],
            cwd=str(FIRMWARE_DIR),
            text=True,
            check=False,
        )
        last_rc = completed.returncode
        if last_rc == 0:
            print("Upload OK. Waiting for USB re-enumeration…")
            time.sleep(2.5)
            return wait_for_port(detect_port() or port_used, timeout=25.0)
        print("Upload failed; waiting for USB CDC to return…")
        time.sleep(2.5)
    raise SystemExit("Upload failed.")


def coordinator_health(host: str = "127.0.0.1", port: int = 8787) -> dict[str, Any]:
    url = f"http://{host}:{port}/api/health"
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            return json.load(resp)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise SystemExit(
            f"Hardware coordinator not reachable at {url} ({exc}). "
            "Keep the existing hardware-mode process on 8787 — do not start a second instance."
        ) from exc


def require_hardware_coordinator() -> dict[str, Any]:
    health = coordinator_health()
    if health.get("fleet") != "hardware":
        raise SystemExit(
            f"Coordinator fleet is {health.get('fleet')!r}, not 'hardware'. "
            "Do not commission against the simulator."
        )
    print(f"Coordinator OK: fleet=hardware env={health.get('env')} path={health.get('devicePath')}")
    return health


def wait_coordinator_module(
    module_id: str,
    timeout: float = 120.0,
    *,
    stable_s: float = COORD_STABLE_S,
    expected_fw: str = EXPECTED_FIRMWARE,
) -> bool:
    """Poll browser WS until module_id stays connected uninterrupted for stable_s (Serial free)."""
    # Prefer Node `ws` already present in SWARM node_modules.
    # With `node -e <code> args…`, argv is [node, ...args] (no -e/script slots).
    node_script = r"""
const WebSocket = require('ws');
const id = process.argv[1];
const timeoutMs = Number(process.argv[2] || 120000);
const stableMs = Number(process.argv[3] || 30000);
const expectedFw = process.argv[4] || '0.3.1';
const ws = new WebSocket('ws://127.0.0.1:8787/ws');
let done = false;
let since = null;
let samples = 0;
const timer = setTimeout(() => { if (!done) { console.log('TIMEOUT'); ws.close(); process.exit(2); } }, timeoutMs);
ws.on('message', (buf) => {
  let msg;
  try { msg = JSON.parse(String(buf)); } catch { return; }
  if (msg.type !== 'snapshot' || !msg.snapshot || !Array.isArray(msg.snapshot.nodes)) return;
  const node = msg.snapshot.nodes.find((n) => n.id === id);
  const fw = node ? (node.fwVersion || node.firmwareVersion || node.firmware || null) : null;
  const ok = !!(node && node.connected && node.simulated === false && fw === expectedFw);
  if (ok) {
    samples += 1;
    if (since == null) since = Date.now();
    if (Date.now() - since < stableMs) return;
    done = true;
    clearTimeout(timer);
    console.log(JSON.stringify({
      id: node.id,
      connected: node.connected,
      firmware: fw,
      simulated: node.simulated ?? null,
      state: node.state || null,
      stable_ms: Date.now() - since,
      samples
    }));
    ws.close();
    process.exit(0);
  } else {
    since = null;
    samples = 0;
  }
});
ws.on('error', (e) => { console.error(String(e)); process.exit(3); });
"""
    swarm_root = FIRMWARE_DIR.parent
    print(
        f"Waiting up to {timeout:.0f}s for {module_id} on hardware coordinator "
        f"({stable_s:.0f}s uninterrupted, fw={expected_fw}, simulated=false)…"
    )
    completed = subprocess.run(
        [
            "node",
            "-e",
            node_script,
            module_id,
            str(int(timeout * 1000)),
            str(int(stable_s * 1000)),
            expected_fw,
        ],
        cwd=str(swarm_root),
        capture_output=True,
        text=True,
        check=False,
    )
    out = (completed.stdout or "").strip()
    err = (completed.stderr or "").strip()
    if completed.returncode == 0 and out:
        try:
            info = json.loads(out.splitlines()[-1])
        except json.JSONDecodeError:
            print(out)
            return True
        print(
            f"  coordinator: {info.get('id')} connected=true "
            f"fw={info.get('firmware')} simulated={info.get('simulated')} "
            f"stable_ms={info.get('stable_ms')} samples={info.get('samples')}"
        )
        return True
    if err:
        print(err, file=sys.stderr)
    print(f"  coordinator: {module_id} not seen stable within timeout", file=sys.stderr)
    return False


def reset_board_to_app(port: str) -> str:
    """Pulse EN to reboot the flashed app (no flash, no NVS writes)."""
    port = wait_for_port(detect_port() or port, timeout=20.0)
    print(f"Resetting board on {port} (EN pulse)…")
    session = SerialSession(port, kick_app=True)
    session.close()
    time.sleep(2.5)
    return wait_for_port(detect_port() or port, timeout=25.0)


def verify_nvs_persistence_after_reset(
    port: str,
    *,
    module_id: str,
    ssid: str,
    coordinator: str,
    coord_port: int,
) -> tuple[str, dict[str, Any]]:
    """Reboot and confirm NVS identity/Wi-Fi/coordinator without re-provisioning."""
    print("NVS persistence check: reset without re-provisioning…")
    port = reset_board_to_app(port)
    session = open_app_session(port)
    try:
        last: Optional[dict[str, Any]] = None
        deadline = time.time() + 55.0
        while time.time() < deadline:
            last = read_status(session, wait=1.5)
            if last and last.get("module_id") == module_id and bool(last.get("provisioned")):
                break
            time.sleep(0.4)
        if not last:
            raise SystemExit("No status JSON after reset — NVS persistence check failed.")

        checks = [
            ("module_id", last.get("module_id") == module_id),
            ("wifi_ssid", last.get("wifi_ssid") == ssid),
            ("coordinator_host", last.get("coordinator_host") == coordinator),
            ("coordinator_port", int(last.get("coordinator_port") or 0) == coord_port),
            ("firmware_version", str(last.get("firmware_version")) == EXPECTED_FIRMWARE),
            ("provisioned", bool(last.get("provisioned"))),
        ]
        print("Verification (NVS after reset, no re-provision):")
        ok = True
        for name, passed in checks:
            print(f"  [{'OK' if passed else 'FAIL'}] {name}")
            ok = ok and passed
        if not ok:
            raise SystemExit("NVS persistence verification failed.")

        # Config must also drive automatic Wi-Fi association after reboot.
        print("Waiting for automatic Wi-Fi association after reset…")
        wifi_deadline = time.time() + 45.0
        wifi_ok = bool(last.get("wifi_connected"))
        while time.time() < wifi_deadline and not wifi_ok:
            cur = read_status(session, wait=1.2)
            if cur:
                last = cur
                if cur.get("wifi_connected") and cur.get("module_id") == module_id:
                    wifi_ok = True
                    break
            time.sleep(0.4)
        print(
            f"  [{'OK' if wifi_ok else 'FAIL'}] wifi_auto_reconnect "
            f"ip={last.get('ip')} ssid={last.get('wifi_ssid')!r}"
        )
        if not wifi_ok:
            raise SystemExit("Wi-Fi did not auto-reconnect after reset (NVS/Wi-Fi config not persistent).")
        return port, last
    finally:
        session.close()
        print("Serial closed after NVS persistence check.")


def open_app_session(port: str) -> SerialSession:
    port = wait_for_port(port, timeout=20.0)
    last_err: Optional[BaseException] = None
    for attempt in range(1, 5):
        try:
            # After esptool, wait for CDC; avoid an immediate RTS pulse on attempt 1
            time.sleep(1.0 if attempt == 1 else 2.0)
            port = wait_for_port(port, timeout=15.0)
            session = SerialSession(port, kick_app=(attempt > 1))
            session.wait_for_app(timeout=45.0)
            return session
        except (OSError, serial.SerialException, SystemExit) as exc:
            last_err = exc
            print(f"  Serial open/listen failed (attempt {attempt}/4): {exc}")
            try:
                # best-effort close if partially opened
                pass
            except Exception:
                pass
            time.sleep(2.0)
            alt = detect_port()
            if alt:
                port = alt
                print(f"  retrying on {port}")
    raise SystemExit(f"Could not open SWARM Serial console: {last_err}")


def read_status(session: SerialSession, wait: float = 2.0) -> Optional[dict]:
    text = session.command("status", wait=wait)
    payloads = extract_status_payloads(text)
    return payloads[-1] if payloads else None


def resolve_credentials(ssid: str) -> tuple[str, str, str]:
    creds = local.load_credentials()
    use_ssid = creds.get("ssid") or ssid or DEFAULT_SSID
    password = creds.get("wifi_password") or ""
    token = creds.get("auth_token") or ""

    if password and token:
        print("Reusing local credentials from tools/.local/credentials.json (secrets hidden).")
        return use_ssid, password, token

    print("Local credentials incomplete — secure prompts (saved under tools/.local/).")
    if not password:
        if sys.stdin.isatty():
            try:
                password = macos_secure_prompt("SWARM Wi-Fi", f"Wi-Fi password for SSID {use_ssid}")
            except SystemExit:
                import getpass

                password = getpass.getpass(f"Wi-Fi password for {use_ssid!r}: ")
        else:
            password = macos_secure_prompt("SWARM Wi-Fi", f"Wi-Fi password for SSID {use_ssid}")
    if not token:
        if sys.stdin.isatty():
            try:
                token = macos_secure_prompt("SWARM Auth Token", "SWARM auth token (match Mac SWARM_AUTH_TOKEN)")
            except SystemExit:
                import getpass

                token = getpass.getpass("SWARM auth token: ")
        else:
            token = macos_secure_prompt("SWARM Auth Token", "SWARM auth token (match Mac SWARM_AUTH_TOKEN)")
    if not password or not token:
        raise SystemExit("Wi-Fi password and auth token are required.")
    local.save_credentials(ssid=use_ssid, wifi_password=password, auth_token=token)
    print(f"Saved credentials to {local.CREDENTIALS_PATH} (gitignored).")
    return use_ssid, password, token


def choose_module_id(manifest: dict, *, requested: Optional[str], chip_mac: str) -> str:
    existing = local.find_module_by_mac(manifest, chip_mac)
    if existing:
        print(f"This MAC is already recorded as {existing} in the local manifest.")
        if requested and requested != existing:
            raise SystemExit(
                f"Refusing to re-assign MAC {chip_mac} from {existing} to {requested}. "
                "Update the local manifest manually only if you intend to rework history."
            )
        return existing

    free = local.next_free_ids(manifest)
    if requested:
        if requested not in local.VALID_IDS:
            raise SystemExit(f"Invalid module id {requested}")
        if requested in local.assigned_ids(manifest) and requested != existing:
            raise SystemExit(
                f"{requested} is already commissioned to another MAC in the manifest. "
                "Choose a free id or fix the manifest."
            )
        return requested

    if not free:
        raise SystemExit("All Mau01–Mau09 are already recorded as commissioned.")

    print("Select module identity for this physical board:")
    for i, mid in enumerate(free, 1):
        marker = " (recommended next)" if i == 1 else ""
        print(f"  {i}. {mid}{marker}")
    raw = input(f"Enter number 1–{len(free)} or id [{free[0]}]: ").strip()
    if not raw:
        return free[0]
    if raw in free:
        return raw
    if raw.isdigit() and 1 <= int(raw) <= len(free):
        return free[int(raw) - 1]
    raise SystemExit(f"Invalid selection {raw!r}")


def safeguard_existing_nvs(
    session: SerialSession,
    *,
    target_id: str,
    chip_mac: str,
    manifest: dict,
) -> Optional[dict]:
    """Inspect current NVS identity. Refuse silent overwrite / Mau01 clobber."""
    payload = read_status(session)
    if not payload:
        print("No status yet (board may be freshly flashed).")
        return None

    current = str(payload.get("module_id") or "")
    provisioned = bool(payload.get("provisioned"))
    print(
        f"Current NVS: module_id={current!r} provisioned={provisioned} "
        f"fw={payload.get('firmware_version')} ssid={payload.get('wifi_ssid')!r}"
    )

    if current == local.PROTECTED_ID and target_id != local.PROTECTED_ID:
        raise SystemExit(
            "Refusing to change identity of a board currently provisioned as Mau01. "
            "Disconnect Mau01 and connect the next ESP32."
        )

    recorded = local.find_module_by_mac(manifest, chip_mac)
    if recorded == local.PROTECTED_ID and target_id != local.PROTECTED_ID:
        raise SystemExit(
            f"MAC {chip_mac} is recorded as Mau01. Never re-assign Mau01's hardware."
        )

    if provisioned and current in local.VALID_IDS and current != target_id:
        print()
        print(f"WARNING: board NVS already has identity {current}, target is {target_id}.")
        ans = input("Overwrite NVS identity? Type the current id to confirm, or Enter to abort: ").strip()
        if ans != current:
            raise SystemExit("Aborted — existing identity preserved.")

    if provisioned and current == target_id:
        print(f"Board already reports {target_id}. Will refresh Wi-Fi/coordinator/token only if you continue.")

    return payload


def provision_nvs(
    session: SerialSession,
    *,
    module_id: str,
    ssid: str,
    password: str,
    token: str,
    coordinator: str,
    coord_port: int,
    wait: float,
) -> dict:
    out = session.command(f"set_module_id {module_id}", wait=1.2)
    if "failed" in out.lower():
        raise SystemExit(f"set_module_id failed:\n{out}")

    out = session.command(
        wifi_command(ssid, password),
        wait=2.0,
        redact_log=f'set_wifi "{ssid}" <redacted>' if " " in ssid else f"set_wifi {ssid} <redacted>",
    )
    if "failed" in out.lower() or "usage:" in out.lower():
        raise SystemExit(f"set_wifi failed:\n{out}")

    out = session.command(f"set_coordinator {coordinator} {coord_port}", wait=1.2)
    if "failed" in out.lower():
        raise SystemExit(f"set_coordinator failed:\n{out}")

    out = session.command(f"set_token {token}", wait=1.2, redact_log="set_token <redacted>")
    if "failed" in out.lower():
        raise SystemExit(f"set_token failed:\n{out}")

    session.command("save_config", wait=1.0)

    print("Waiting for Wi-Fi association (brief Serial status)…")
    deadline = time.time() + wait
    last: Optional[dict] = None
    while time.time() < deadline:
        last = read_status(session, wait=1.2)
        if last:
            print(
                f"  id={last.get('module_id')} wifi={last.get('wifi_connected')} "
                f"ip={last.get('ip')} ssid={last.get('wifi_ssid')!r} "
                f"fw={last.get('firmware_version')} state={last.get('state')}"
            )
            if last.get("module_id") == module_id and last.get("wifi_connected"):
                break
        time.sleep(0.4)

    if not last:
        raise SystemExit("No status JSON after provisioning.")

    checks = [
        ("module_id", last.get("module_id") == module_id),
        ("wifi_ssid", last.get("wifi_ssid") == ssid),
        ("wifi_connected", bool(last.get("wifi_connected"))),
        ("coordinator_host", last.get("coordinator_host") == coordinator),
        ("coordinator_port", int(last.get("coordinator_port") or 0) == coord_port),
        ("firmware_version", str(last.get("firmware_version")) == EXPECTED_FIRMWARE),
        ("provisioned", bool(last.get("provisioned"))),
        ("position_valid_false", last.get("position_valid") is False),
    ]
    print("Verification (Serial):")
    ok = True
    for name, passed in checks:
        print(f"  [{'OK' if passed else 'FAIL'}] {name}")
        ok = ok and passed
    if not ok:
        raise SystemExit("Serial verification failed.")
    return last


def cmd_status(_: argparse.Namespace) -> int:
    try:
        require_hardware_coordinator()
    except SystemExit as exc:
        print(f"Coordinator: {exc}")
    manifest = local.load_manifest()
    local.print_manifest(manifest)
    free = local.next_free_ids(manifest)
    print(f"Next free ids: {', '.join(free) if free else '(none)'}")
    creds = local.load_credentials()
    print(
        "Local credentials: "
        f"ssid={creds.get('ssid') or '—'!r} "
        f"wifi_password={'set' if creds.get('wifi_password') else 'missing'} "
        f"auth_token={'set' if creds.get('auth_token') else 'missing'}"
    )
    return 0


def cmd_inspect(args: argparse.Namespace) -> int:
    require_hardware_coordinator()
    port = args.port or detect_port()
    if not port:
        list_serial_ports()
        raise SystemExit("No serial port detected. Connect one ESP32 via USB.")

    # Prefer Serial BEFORE esptool so CDC stays usable for NVS identity.
    print(f"Inspecting Serial on {port} (no NVS writes)…")
    nvs_id = None
    try:
        session = open_app_session(port)
        try:
            payload = read_status(session)
            if payload:
                nvs_id = payload.get("module_id")
                print(
                    f"NVS/status: id={payload.get('module_id')} fw={payload.get('firmware_version')} "
                    f"wifi={payload.get('wifi_connected')} ssid={payload.get('wifi_ssid')!r} "
                    f"ws={payload.get('ws_linked')} state={payload.get('state')} "
                    f"provisioned={payload.get('provisioned')}"
                )
                if payload.get("module_id") == local.PROTECTED_ID:
                    print("This looks like Mau01 — do not flash/re-id it for Mau02–Mau09.")
            else:
                print("No status JSON (app up but quiet).")
        finally:
            session.close()
            print("Serial closed.")
    except SystemExit as exc:
        print(f"Serial inspect skipped: {exc}")

    time.sleep(1.0)
    port = detect_port() or port
    info = probe_chip(port)
    manifest = local.load_manifest()
    recorded = local.find_module_by_mac(manifest, info["mac"])
    print(f"Manifest record for this MAC: {recorded or '—'}")
    if nvs_id == local.PROTECTED_ID or recorded == local.PROTECTED_ID:
        print("Safeguard: treat as Mau01 hardware — disconnect before commissioning Mau02+.")
    return 0


def cmd_commission(args: argparse.Namespace) -> int:
    require_hardware_coordinator()
    manifest = local.load_manifest()
    port = args.port or detect_port()
    if not port:
        list_serial_ports()
        raise SystemExit("No serial port detected. Connect one ESP32-S3 via USB.")

    print()
    print("=== SWARM Phase C.1 commission ===")
    list_serial_ports()
    print(f"Using port: {port}")

    info = probe_chip(port)
    port = str(info.get("port") or port)
    chip_mac = info["mac"]
    pio_env = info["pio_env"]

    # Hard stop if this is Mau01's known MAC and operator asked for another id
    recorded = local.find_module_by_mac(manifest, chip_mac)
    if recorded == local.PROTECTED_ID and args.module and args.module != local.PROTECTED_ID:
        raise SystemExit("Connected board MAC is Mau01. Disconnect it before commissioning another id.")

    module_id = choose_module_id(manifest, requested=args.module, chip_mac=chip_mac)
    if module_id == local.PROTECTED_ID and recorded not in (None, local.PROTECTED_ID):
        raise SystemExit("Refusing unexpected Mau01 assignment.")

    coordinator = args.coordinator
    if not coordinator:
        ips = mac_lan_ips()
        if len(ips) == 1:
            coordinator = ips[0]
        elif args.coordinator_default:
            coordinator = args.coordinator_default
        else:
            print("LAN IPs:", ", ".join(ips) if ips else "(none)")
            coordinator = input("Coordinator LAN IP: ").strip()
    if not coordinator:
        raise SystemExit("Coordinator IP required.")

    ssid, password, token = resolve_credentials(args.ssid)

    print()
    print(f"Plan:")
    print(f"  USB port:     {port}")
    print(f"  MAC:          {chip_mac}")
    print(f"  Flash:        {info['flash_mb']} MB / {pio_env}")
    print(f"  Module id:    {module_id}")
    print(f"  SSID:         {ssid}")
    print(f"  Coordinator:  {coordinator}:{args.coord_port}/swarm")
    print("  Secrets:      (hidden, local reuse)")
    print("  Motors:       not commanded")
    print()

    if recorded == module_id and not args.force_flash and not args.yes_flash:
        skip = input("This MAC is already commissioned as that id. Skip flash and only refresh NVS? [Y/n] ").strip().lower()
        do_flash = skip in ("n", "no")
    elif args.yes_flash:
        print("Flash confirmed via --yes-flash (operator-authorized).")
        do_flash = True
    else:
        confirm = input("Flash firmware 0.3.1 to THIS physical board? [y/N] ").strip().lower()
        do_flash = confirm in ("y", "yes")
        if not do_flash:
            # Allow NVS-only if app already present
            nvs_only = input("Skip flash and attempt NVS provisioning on current firmware? [y/N] ").strip().lower()
            if nvs_only not in ("y", "yes"):
                print("Aborted — no flash, no NVS changes.")
                return 1

    if do_flash:
        port = flash_firmware(port, pio_env)
        # Port path may stay the same; wait for app
        print("If Serial stays in download mode, press RESET (not BOOT).")

    fw = EXPECTED_FIRMWARE
    session = open_app_session(port)
    try:
        safeguard_existing_nvs(session, target_id=module_id, chip_mac=chip_mac, manifest=manifest)
        last = provision_nvs(
            session,
            module_id=module_id,
            ssid=ssid,
            password=password,
            token=token,
            coordinator=coordinator,
            coord_port=args.coord_port,
            wait=args.wait,
        )
        fw = str(last.get("firmware_version") or "")
        if fw != EXPECTED_FIRMWARE:
            raise SystemExit(f"Unexpected firmware {fw!r}; expected {EXPECTED_FIRMWARE}.")
    finally:
        session.close()
        print("Serial closed — releasing USB Serial before post-provision gates.")

    # Gate 2: NVS must survive reboot without re-running set_* commands.
    port, last = verify_nvs_persistence_after_reset(
        port,
        module_id=module_id,
        ssid=ssid,
        coordinator=coordinator,
        coord_port=args.coord_port,
    )
    fw = str(last.get("firmware_version") or fw)
    if fw != EXPECTED_FIRMWARE:
        raise SystemExit(f"Post-reset firmware {fw!r}; expected {EXPECTED_FIRMWARE}.")

    # Gate 3: USB Serial free, then uninterrupted hardware WS for COORD_STABLE_S.
    print("Settling with Serial released before WebSocket stability check…")
    time.sleep(8.0)
    ws_timeout = max(float(args.wait), COORD_STABLE_S + 60.0)
    ws_ok = wait_coordinator_module(
        module_id,
        timeout=ws_timeout,
        stable_s=COORD_STABLE_S,
        expected_fw=EXPECTED_FIRMWARE,
    )
    if not ws_ok:
        print(
            f"FAIL: {module_id} did not stay connected on the hardware coordinator "
            f"for {COORD_STABLE_S:.0f}s.",
            file=sys.stderr,
        )
        return 1

    local.record_success(
        manifest,
        module_id=module_id,
        mac=chip_mac,
        flash_mb=int(info["flash_mb"]),
        pio_env=pio_env,
        firmware=EXPECTED_FIRMWARE,
        ssid=ssid,
        coordinator_host=coordinator,
        coordinator_port=args.coord_port,
        usb_port=port,
    )
    print()
    print(f"SUCCESS: {module_id} commissioned (MAC {chip_mac}).")
    print(f"Manifest updated: {local.MANIFEST_PATH}")
    local.print_manifest(local.load_manifest())
    print()
    print("Operator next steps:")
    print("  1. Confirm Mau0N on the Svelte System page (hardware).")
    print("  2. Disconnect this USB board.")
    print("  3. Connect the next ESP32-S3.")
    print("  4. Run:  python3 tools/commission_next.py next")
    print("Do not home or move motors yet.")
    return 0


def cmd_next(args: argparse.Namespace) -> int:
    """Commission the next free id (skips Mau01 if already recorded)."""
    manifest = local.load_manifest()
    free = local.next_free_ids(manifest)
    if not free:
        print("All modules already commissioned in the local manifest.")
        return 0
    # Prefer first free that isn't forcing Mau01 if Mau01 done
    args.module = free[0]
    print(f"Next free identity: {args.module}")
    return cmd_commission(args)


def cmd_seed_mau01(args: argparse.Namespace) -> int:
    """Record Mau01 in the local manifest without flashing (already done)."""
    manifest = local.load_manifest()
    mac = local.normalize_mac(args.mac)
    local.record_success(
        manifest,
        module_id="Mau01",
        mac=mac,
        flash_mb=args.flash_mb,
        pio_env="swarm_s3_4mb_ota" if args.flash_mb == 4 else "swarm_s3_8mb_ota",
        firmware=args.firmware,
        ssid=args.ssid,
        coordinator_host=args.coordinator,
        coordinator_port=args.coord_port,
        usb_port=args.port or "",
        notes="Seeded after successful Phase B/C.0 bench commissioning",
    )
    print("Mau01 recorded in local manifest.")
    local.print_manifest(local.load_manifest())
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="SWARM sequential commissioning (Phase C.1)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_status = sub.add_parser("status", help="Show manifest, credentials presence, coordinator health")
    p_status.set_defaults(func=cmd_status)

    p_inspect = sub.add_parser("inspect", help="Probe USB board without changing NVS")
    p_inspect.add_argument("--port")
    p_inspect.set_defaults(func=cmd_inspect)

    p_next = sub.add_parser("next", help="Commission next free Mau0N (interactive)")
    p_next.add_argument("--port")
    p_next.add_argument("--ssid", default=DEFAULT_SSID)
    p_next.add_argument("--coordinator", default="")
    p_next.add_argument("--coordinator-default", default="", help=argparse.SUPPRESS)
    p_next.add_argument("--coord-port", type=int, default=DEFAULT_COORD_PORT)
    p_next.add_argument("--wait", type=float, default=40.0)
    p_next.add_argument("--force-flash", action="store_true")
    p_next.add_argument(
        "--yes-flash",
        action="store_true",
        help="Operator-authorized flash without interactive y/N (still refuses Mau01 clobber)",
    )
    p_next.set_defaults(func=cmd_next, module=None)

    p_comm = sub.add_parser("commission", help="Commission a specific module id")
    p_comm.add_argument("--module", required=True, help="Mau02 … Mau09 (Mau01 only if intentional)")
    p_comm.add_argument("--port")
    p_comm.add_argument("--ssid", default=DEFAULT_SSID)
    p_comm.add_argument("--coordinator", default="")
    p_comm.add_argument("--coordinator-default", default="", help=argparse.SUPPRESS)
    p_comm.add_argument("--coord-port", type=int, default=DEFAULT_COORD_PORT)
    p_comm.add_argument("--wait", type=float, default=40.0)
    p_comm.add_argument("--force-flash", action="store_true")
    p_comm.add_argument(
        "--yes-flash",
        action="store_true",
        help="Operator-authorized flash without interactive y/N (still refuses Mau01 clobber)",
    )
    p_comm.set_defaults(func=cmd_commission)

    p_seed = sub.add_parser("seed-mau01", help="Record already-commissioned Mau01 in local manifest")
    p_seed.add_argument("--mac", required=True)
    p_seed.add_argument("--flash-mb", type=int, default=4)
    p_seed.add_argument("--firmware", default="0.3.1")
    p_seed.add_argument("--ssid", default=DEFAULT_SSID)
    p_seed.add_argument("--coordinator", required=True)
    p_seed.add_argument("--coord-port", type=int, default=DEFAULT_COORD_PORT)
    p_seed.add_argument("--port", default="")
    p_seed.set_defaults(func=cmd_seed_mau01)

    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted.")
        raise SystemExit(130)
