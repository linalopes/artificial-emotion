#!/usr/bin/env python3
"""Provision one SWARM ESP32 module over USB Serial (NVS identity + Wi-Fi + coordinator).

Same firmware binary for all modules. Identities: Mau01 … Mau09.

Secrets (Wi-Fi password, auth token) are prompted locally and never printed.
Do not commit files that contain those secrets.

Requires: pip install pyserial

Examples:
  python3 tools/provision_module.py --module Mau01
  python3 tools/provision_module.py --module Mau02 --port /dev/cu.usbmodem2101
  python3 tools/provision_module.py --module Mau01 --ssid "School of AI" --coordinator 192.168.1.20
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import subprocess
import sys
import time
from typing import Optional

try:
    import serial
    from serial.tools import list_ports
except ImportError as exc:
    raise SystemExit("Install dependency: pip install pyserial") from exc

VALID_IDS = {f"Mau{i:02d}" for i in range(1, 10)}
DEFAULT_SSID = "School of AI"
DEFAULT_COORD_PORT = 8787
BAUD = 115200


def mac_lan_ips() -> list[str]:
    """Best-effort list of non-loopback IPv4 addresses (macOS / Linux)."""
    import socket

    ips: list[str] = []
    try:
        out = subprocess.check_output(["ifconfig"], text=True, stderr=subprocess.DEVNULL)
        for m in re.finditer(r"inet (\d+\.\d+\.\d+\.\d+)", out):
            ip = m.group(1)
            if not ip.startswith("127."):
                ips.append(ip)
    except (OSError, subprocess.SubprocessError):
        pass
    if not ips:
        try:
            hostname = socket.gethostname()
            for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
                ip = info[4][0]
                if not ip.startswith("127.") and ip not in ips:
                    ips.append(ip)
        except OSError:
            pass
    return ips


def macos_secure_prompt(title: str, prompt: str) -> str:
    """Hidden-answer macOS dialog. Secret never printed by this helper."""
    script = (
        f'display dialog "{prompt}" with title "{title}" '
        f'default answer "" with hidden answer '
        f'buttons {{"Cancel", "OK"}} default button "OK"'
    )
    try:
        out = subprocess.check_output(["osascript", "-e", script], text=True)
    except subprocess.CalledProcessError as exc:
        raise SystemExit("Credential prompt cancelled.") from exc
    # AppleScript: button returned:OK, text returned:<secret>
    marker = "text returned:"
    if marker not in out:
        raise SystemExit("Could not read credential from dialog.")
    return out.split(marker, 1)[1].rstrip("\n")


def resolve_secret(cli_value: str, env_name: str, *, gui: bool, title: str, prompt: str) -> str:
    if cli_value:
        return cli_value
    env_val = os.environ.get(env_name, "")
    if env_val:
        return env_val
    if gui:
        return macos_secure_prompt(title, prompt)
    return getpass.getpass(f"{prompt}: ")


def detect_port() -> Optional[str]:
    """Prefer ESP USB-serial devices; never pick Bluetooth/debug-console noise."""
    scored: list[tuple[int, str]] = []
    for p in list_ports.comports():
        dev = p.device
        desc = f"{dev} {p.description} {p.manufacturer or ''} {p.product or ''}".lower()
        hwid = (p.hwid or "").lower()
        # Hard rejects
        if any(bad in dev.lower() for bad in ("bluetooth", "debug-console", "incoming-port", "jabra", "headset")):
            continue
        score = 0
        if "usbmodem" in dev.lower() or "usbserial" in dev.lower() or "wchusb" in dev.lower():
            score += 100
        if "303a" in hwid or "espressif" in desc or "usb jtag" in desc:
            score += 80
        if any(k in desc for k in ("cp210", "ch340", "silicon labs", "wch", "uart")):
            score += 40
        if "ttyacm" in dev.lower():
            score += 30
        if score > 0:
            scored.append((score, dev))
    if not scored:
        return None
    scored.sort(key=lambda x: (-x[0], x[1]))
    return scored[0][1]


def list_serial_ports() -> None:
    ports = list(list_ports.comports())
    if not ports:
        print("No serial ports found.")
        return
    print("Serial ports:")
    for p in ports:
        print(f"  {p.device:40s}  {p.description}")


class SerialSession:
    def __init__(self, port: str, baud: int = BAUD, *, kick_app: bool = True) -> None:
        # Open without asserting download straps. Default pyserial DTR=True
        # puts many ESP32-S3 USB-JTAG boards straight into ROM download mode.
        self.ser = serial.Serial()
        self.ser.port = port
        self.ser.baudrate = baud
        self.ser.timeout = 0.2
        self.ser.dtr = False
        self.ser.rts = False
        self.ser.open()
        time.sleep(0.3)
        try:
            self.ser.reset_input_buffer()
        except OSError:
            # CDC sometimes needs a moment after esptool hard_reset
            time.sleep(1.5)
            self.ser.reset_input_buffer()
        if kick_app:
            self.exit_download_to_app()

    def close(self) -> None:
        try:
            self.ser.dtr = False
            self.ser.rts = False
        except Exception:
            pass
        self.ser.close()

    def exit_download_to_app(self) -> None:
        """Pulse EN with IO0 high so USB-JTAG boots the flashed app, not the ROM."""
        self.ser.dtr = False  # IO0 high (run)
        self.ser.rts = False
        time.sleep(0.05)
        self.ser.rts = True  # EN low
        time.sleep(0.1)
        self.ser.rts = False  # EN high → boot
        time.sleep(0.4)
        self.ser.dtr = False
        self.ser.rts = False

    def write_line(self, line: str) -> None:
        self.ser.write((line + "\n").encode("utf-8"))
        self.ser.flush()

    def read_for(self, seconds: float) -> str:
        end = time.time() + seconds
        chunks: list[bytes] = []
        while time.time() < end:
            waiting = self.ser.in_waiting
            if waiting:
                chunks.append(self.ser.read(waiting))
            else:
                time.sleep(0.05)
        return b"".join(chunks).decode("utf-8", errors="replace")

    def wait_for_app(self, timeout: float = 45.0) -> str:
        """Wait until firmware banner appears. May ask for a physical RESET."""
        print("Waiting for SWARM firmware on Serial (not ROM download mode)…")
        deadline = time.time() + timeout
        asked = False
        buf = ""
        while time.time() < deadline:
            chunk = self.read_for(0.8)
            if chunk:
                buf += chunk
                # Show non-secret boot noise
                for line in chunk.splitlines():
                    if line.strip():
                        print(f"  {line}")
            if "SWARM v1 firmware" in buf or "[SWARM]" in buf or "Type 'help'" in buf:
                print("Firmware Serial console is up.")
                return buf
            if "waiting for download" in buf and not asked:
                print()
                print("Board is in ROM download mode (app not running).")
                print("Press the module RESET button once — do NOT hold BOOT.")
                print("Waiting for firmware banner…")
                asked = True
                buf = ""
                self.ser.reset_input_buffer()
                self.exit_download_to_app()
            elif not asked and time.time() + timeout - deadline > 6:
                # after a few seconds with no banner, try reset again + prompt
                print("No firmware banner yet — trying USB-JTAG run reset…")
                self.exit_download_to_app()
                print("If this continues, press the physical RESET button once (not BOOT).")
                asked = True
        raise SystemExit(
            "Timed out waiting for SWARM firmware Serial. "
            "Check USB, press RESET (not BOOT), confirm flash size / image."
        )

    def command(self, line: str, wait: float = 1.5, *, redact_log: Optional[str] = None) -> str:
        shown = redact_log if redact_log is not None else line
        print(f"→ {shown}")
        self.write_line(line)
        return self.read_for(wait)


def extract_status_payloads(text: str) -> list[dict]:
    payloads: list[dict] = []
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith(">> "):
            line = line[3:].strip()
        if not line.startswith("{"):
            continue
        try:
            doc = json.loads(line)
        except json.JSONDecodeError:
            continue
        if doc.get("type") == "status" and isinstance(doc.get("payload"), dict):
            payloads.append(doc["payload"])
    return payloads


def wifi_command(ssid: str, password: str) -> str:
    if " " in ssid or '"' in ssid:
        if '"' in ssid:
            raise SystemExit("SSID must not contain double quotes")
        return f'set_wifi "{ssid}" {password}'
    return f"set_wifi {ssid} {password}"


def provision(args: argparse.Namespace) -> int:
    if args.module not in VALID_IDS:
        print(f"Invalid module id {args.module!r}; use Mau01…Mau09", file=sys.stderr)
        return 2

    port = args.port or detect_port()
    if not port:
        print("Could not auto-detect serial port. Pass --port explicitly.", file=sys.stderr)
        list_serial_ports()
        return 2

    coordinator = args.coordinator
    if not coordinator:
        ips = mac_lan_ips()
        if not ips:
            print("Could not detect Mac LAN IP. Pass --coordinator <ip>.", file=sys.stderr)
            print("Hint: ipconfig getifaddr en0   # or en1", file=sys.stderr)
            return 2
        if len(ips) == 1:
            coordinator = ips[0]
            print(f"Using detected LAN IP: {coordinator}")
        else:
            print("Multiple LAN IPs detected:")
            for i, ip in enumerate(ips, 1):
                print(f"  {i}. {ip}")
            print("Pass --coordinator <ip> explicitly (same Wi-Fi as the ESP32).", file=sys.stderr)
            return 2

    password = resolve_secret(
        args.wifi_password,
        "SWARM_WIFI_PASSWORD",
        gui=args.gui_prompt,
        title="SWARM Wi-Fi",
        prompt=f"Wi-Fi password for SSID {args.ssid}",
    )
    if not password:
        print("Wi-Fi password required.", file=sys.stderr)
        return 2

    token = resolve_secret(
        args.token,
        "SWARM_AUTH_TOKEN",
        gui=args.gui_prompt,
        title="SWARM Auth Token",
        prompt="SWARM auth token (must match Mac SWARM_AUTH_TOKEN)",
    )
    if not token:
        print("Auth token required.", file=sys.stderr)
        return 2

    # Persist token only in a local gitignored file for the same-session coordinator start.
    if args.write_token_file:
        token_path = os.path.abspath(args.write_token_file)
        os.makedirs(os.path.dirname(token_path), exist_ok=True)
        fd = os.open(token_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(token)
        print(f"Auth token stored locally for coordinator (gitignored): {token_path}")

    print()
    print(f"Port:         {port}")
    print(f"Module:       {args.module}")
    print(f"SSID:         {args.ssid}")
    print(f"Coordinator:  {coordinator}:{args.coord_port}/swarm")
    print("Password:     (hidden)")
    print("Auth token:   (hidden)")
    print()

    if not args.yes:
        confirm = input("Proceed? [y/N] ").strip().lower()
        if confirm not in ("y", "yes"):
            print("Aborted.")
            return 1

    session = SerialSession(port)
    try:
        boot = session.wait_for_app(timeout=max(45.0, args.wait))
        if "Boot: coils safe" in boot or "no auto motion" in boot:
            print("Boot reported coils safe / no auto motion.")

        out = session.command(f"set_module_id {args.module}", wait=1.0)
        if "failed" in out.lower():
            print(out)
            print("set_module_id failed.", file=sys.stderr)
            return 1

        wifi_line = wifi_command(args.ssid, password)
        out = session.command(
            wifi_line,
            wait=2.0,
            redact_log=f'set_wifi "{args.ssid}" <redacted>'
            if " " in args.ssid
            else f"set_wifi {args.ssid} <redacted>",
        )
        if "failed" in out.lower() or "usage:" in out.lower() or "unclosed" in out.lower():
            print(out)
            print("set_wifi failed.", file=sys.stderr)
            return 1

        out = session.command(
            f"set_coordinator {coordinator} {args.coord_port}",
            wait=1.0,
        )
        if "failed" in out.lower():
            print(out)
            print("set_coordinator failed.", file=sys.stderr)
            return 1

        out = session.command(
            f"set_token {token}",
            wait=1.0,
            redact_log="set_token <redacted>",
        )
        if "failed" in out.lower():
            print(out)
            print("set_token failed.", file=sys.stderr)
            return 1

        # Commands above already persist; save_config bumps revision again and confirms path.
        session.command("save_config", wait=1.0)

        print("Waiting for Wi-Fi / status…")
        deadline = time.time() + args.wait
        last_payload: Optional[dict] = None
        while time.time() < deadline:
            text = session.command("status", wait=1.2)
            payloads = extract_status_payloads(text)
            if payloads:
                last_payload = payloads[-1]
                wifi_ok = bool(last_payload.get("wifi_connected"))
                ws_ok = bool(last_payload.get("ws_linked"))
                mid = last_payload.get("module_id")
                print(
                    f"  module_id={mid}  wifi={wifi_ok}  ip={last_payload.get('ip')}  "
                    f"ssid={last_payload.get('wifi_ssid')!r}  "
                    f"coord={last_payload.get('coordinator_host')}:{last_payload.get('coordinator_port')}  "
                    f"ws={ws_ok}  fw={last_payload.get('firmware_version')}  "
                    f"state={last_payload.get('state')}"
                )
                if mid == args.module and wifi_ok:
                    break
            time.sleep(0.5)

        if not last_payload:
            print("No status JSON received. Is the correct USB port selected?", file=sys.stderr)
            return 1

        ok = True
        checks = [
            ("module_id", last_payload.get("module_id") == args.module),
            ("wifi_ssid", last_payload.get("wifi_ssid") == args.ssid),
            ("wifi_connected", bool(last_payload.get("wifi_connected"))),
            ("coordinator_host", last_payload.get("coordinator_host") == coordinator),
            ("coordinator_port", int(last_payload.get("coordinator_port") or 0) == args.coord_port),
            ("firmware_version", str(last_payload.get("firmware_version", "")).startswith("0.3.")),
            ("provisioned", bool(last_payload.get("provisioned"))),
        ]
        print()
        print("Verification:")
        for name, passed in checks:
            mark = "OK" if passed else "FAIL"
            print(f"  [{mark}] {name}")
            ok = ok and passed

        if last_payload.get("ws_linked"):
            print("  [OK] ws_linked (coordinator reachable)")
        else:
            print(
                "  [--] ws_linked false — start SWARM Control in hardware mode on the Mac, "
                "same token, then re-check status"
            )

        if last_payload.get("position_valid"):
            print("  [WARN] position_valid true at provision (unexpected before home)")
        else:
            print("  [OK] position_valid false (no assumed pose)")

        print()
        if ok:
            print(f"Provisioning of {args.module} looks good (Wi-Fi + identity + coordinator NVS).")
            print("Reboot the board once, send status again, and confirm values persist.")
            print("Do not home or move motors until the bench checklist says so.")
            return 0

        print("Provisioning incomplete — see FAIL lines above.", file=sys.stderr)
        return 1
    finally:
        session.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Provision one SWARM MauMau module over USB Serial")
    parser.add_argument("--module", required=False, help="Mau01 … Mau09")
    parser.add_argument("--port", help="Serial device (auto-detect if omitted)")
    parser.add_argument("--ssid", default=DEFAULT_SSID, help=f'Default: "{DEFAULT_SSID}"')
    parser.add_argument(
        "--wifi-password",
        default="",
        help="Optional; prefer interactive prompt (never commit this)",
    )
    parser.add_argument("--coordinator", help="Mac LAN IP (not invented; detect or pass explicitly)")
    parser.add_argument("--coord-port", type=int, default=DEFAULT_COORD_PORT)
    parser.add_argument("--token", default="", help="Optional; prefer interactive prompt")
    parser.add_argument(
        "--gui-prompt",
        action="store_true",
        help="macOS secure dialogs for Wi-Fi password and auth token",
    )
    parser.add_argument(
        "--write-token-file",
        default="",
        help="Optional path to store auth token locally (use a gitignored path)",
    )
    parser.add_argument("--wait", type=float, default=25.0, help="Seconds to wait for Wi-Fi")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    parser.add_argument("--list-ports", action="store_true", help="List serial ports and exit")
    parser.add_argument("--show-lan", action="store_true", help="Print detected LAN IPs and exit")
    args = parser.parse_args()

    if args.list_ports:
        list_serial_ports()
        return 0
    if args.show_lan:
        ips = mac_lan_ips()
        if not ips:
            print("No LAN IPs detected. Try: ipconfig getifaddr en0")
            return 1
        for ip in ips:
            print(ip)
        return 0
    if not args.module:
        parser.error("--module is required unless --list-ports / --show-lan")
    return provision(args)


if __name__ == "__main__":
    sys.exit(main())
