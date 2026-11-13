#!/usr/bin/env python3
"""Minimal Swarm mock coordinator (Phase A.3) — protocol exercise only.

Requires: pip install websockets
Usage:    python3 tools/mock_coordinator.py [--port 8765]

Not the Phase B Mac coordinator or web UI.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from typing import Dict, Optional

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError as exc:
    raise SystemExit("Install dependency: pip install websockets") from exc

AUTH = "swarm-local"
clients: Dict[str, WebSocketServerProtocol] = {}
_coord_t0 = time.monotonic()
_sync_seq = 1
_pending_sync: Dict[str, dict] = {}


def coord_us() -> int:
    return int((time.monotonic() - _coord_t0) * 1_000_000)


def envelope(msg_type: str, target: str, payload: dict, source: str = "swarm-controller") -> str:
    return json.dumps(
        {
            "protocol_version": 1,
            "message_id": f"mock-{int(time.time() * 1000)}-{msg_type}",
            "source": source,
            "target": target,
            "type": msg_type,
            "timestamp_ms": int(time.time() * 1000),
            "payload": payload,
        }
    )


async def send_to(target: str, msg: str) -> None:
    dead = []
    for mid, ws in clients.items():
        if target not in ("broadcast", "*", mid):
            continue
        try:
            await ws.send(msg)
            print(f"> {mid}")
        except Exception as exc:  # noqa: BLE001
            print(f"send failed {mid}: {exc}")
            dead.append(mid)
    for mid in dead:
        clients.pop(mid, None)


async def handler(ws: WebSocketServerProtocol):
    peer = getattr(ws, "remote_address", None)
    print(f"[+] connection {peer}")
    module_id: Optional[str] = None
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                print(f" ! bad json: {raw[:120]}")
                continue
            mtype = msg.get("type")
            source = msg.get("source")
            print(f"< {source} {mtype}")
            if mtype == "status" and source:
                module_id = source
                clients[source] = ws
                p = msg.get("payload", {})
                print(
                    f"  state={p.get('state')} synced={p.get('clock_synced')} "
                    f"unc={p.get('clock_uncertainty_us')} run={p.get('run_phase')}"
                )
            elif mtype == "clock_sync_resp" and source:
                p = msg.get("payload", {})
                t1 = int(p.get("t1_us", 0))
                t2 = int(p.get("t2_us", 0))
                t3 = int(p.get("t3_us", 0))
                seq = int(p.get("sync_seq", 0))
                t4 = coord_us()
                fin = envelope(
                    "clock_sync_fin",
                    source,
                    {
                        "sync_seq": seq,
                        "t1_us": t1,
                        "t2_us": t2,
                        "t3_us": t3,
                        "t4_us": t4,
                    },
                )
                await ws.send(fin)
                print(f"> {source} clock_sync_fin rtt_est_us≈{(t4 - t1) - (t3 - t2)}")
            elif mtype in ("ack", "nack", "run_armed", "run_started", "run_completed", "run_failed"):
                print(f"  {msg.get('payload')}")
    finally:
        if module_id and clients.get(module_id) is ws:
            del clients[module_id]
        print(f"[-] disconnected {module_id or peer}")


async def repl(stop: asyncio.Event):
    global _sync_seq
    print(
        "Commands: list | status | sync | home MauNN | stop_all | "
        "prepare_run <run_id> | commit_run <run_id> [lead_ms] | cancel_run <run_id> | quit"
    )
    loop = asyncio.get_event_loop()
    while not stop.is_set():
        line = await loop.run_in_executor(None, input, "coord> ")
        line = line.strip()
        if not line:
            continue
        if line in ("quit", "exit"):
            stop.set()
            break
        if line == "list":
            print("online:", ", ".join(sorted(clients)) or "(none)")
            continue
        parts = line.split()
        cmd = parts[0]
        auth = {"auth_token": AUTH}
        if cmd == "status":
            await send_to("broadcast", envelope("get_status", "broadcast", {}))
        elif cmd == "sync":
            t1 = coord_us()
            _sync_seq += 1
            await send_to(
                "broadcast",
                envelope(
                    "clock_sync_req",
                    "broadcast",
                    {"t1_us": t1, "sync_seq": _sync_seq},
                ),
            )
        elif cmd == "home":
            target = parts[1] if len(parts) > 1 else "broadcast"
            await send_to(target, envelope("home", target, auth))
        elif cmd == "stop_all":
            await send_to("broadcast", envelope("stop_all", "broadcast", auth))
        elif cmd == "prepare_run":
            run_id = parts[1] if len(parts) > 1 else "run-demo"
            await send_to("broadcast", envelope("prepare_run", "broadcast", {**auth, "run_id": run_id}))
        elif cmd == "commit_run":
            run_id = parts[1] if len(parts) > 1 else "run-demo"
            lead_ms = int(parts[2]) if len(parts) > 2 else 1000
            start_at = coord_us() + lead_ms * 1000
            await send_to(
                "broadcast",
                envelope(
                    "commit_run",
                    "broadcast",
                    {**auth, "run_id": run_id, "start_at_us": start_at},
                ),
            )
        elif cmd == "cancel_run":
            run_id = parts[1] if len(parts) > 1 else "run-demo"
            await send_to("broadcast", envelope("cancel_run", "broadcast", {**auth, "run_id": run_id}))
        else:
            print("unknown command")


async def main(host: str, port: int):
    stop = asyncio.Event()
    async with websockets.serve(handler, host, port, ping_interval=20, ping_timeout=20):
        print(f"Mock Swarm coordinator ws://{host}:{port}/swarm")
        print(f"Auth token default: {AUTH}")
        await repl(stop)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Swarm Phase A.3 mock coordinator")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    asyncio.run(main(args.host, args.port))
