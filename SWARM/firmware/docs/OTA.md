# Swarm v1 — OTA (Phase A.1 / A.2)

## Flash size must be verified

ESP32-S3 Super Mini clones ship with different flash sizes (commonly 4 MB, sometimes 8 MB).  
**Do not mount modules on the ceiling until flash size and a successful OTA round-trip are confirmed on the actual units.**

### Verification procedure

```bash
export PATH="$HOME/.platformio/penv/bin:$PATH"
cd SWARM/firmware
pio pkg exec -p tool-esptoolpy -- esptool.py flash_id
```

| Flash | PlatformIO env |
|---|---|
| 4 MB | `swarm_s3_4mb_ota` (default) |
| 8 MB | `swarm_s3_8mb_ota` |

### Partition layouts

- `partitions/swarm_4mb_ota.csv` — dual OTA slots (~1.75 MB each)  
- `partitions/swarm_8mb_ota.csv` — larger dual OTA slots  

## Update flow (firmware 0.1.1+)

1. Node must be idle (not moving/homing); coils not mid-trajectory.
2. Coordinator sends `ota_update` with `url` (`http://` LAN only) and `auth_token`.
3. Node performs a **chunked** download/write (≈1 KB per `loop`), feeding the task WDT.
4. Validates ESP image **magic `0xE9`** before flashing body; rejects oversized images vs OTA slot.
5. `Update.end()` verifies the **ESP app image checksum** embedded in the binary.
6. A client-supplied hash is **not** treated as authentication (token + local network only).
7. On success: reboot → always **UNHOMED**, `position_valid=false`, **no auto motion**.
8. NVS (`swarm` namespace) is outside app OTA slots → **identity/config preserved** across successful OTA when the same partition table is used.

### Failure modes

| Failure | Behavior |
|---|---|
| Auth fail | `FAULT` / `ota_rejected`; no flash |
| Bad magic / size | Abort; `FAULT` / `ota_failed`; prior app remains bootable |
| Stall / disconnect mid-write | `Update.abort()`; `FAULT`; prior slot unchanged if end() never succeeded |
| Power loss mid-write | Dual-OTA: bootloader should keep previous slot if otadata not flipped; **not claimed as certified rollback** |

### What is validated vs what is not

| Check | Implemented? |
|---|---|
| Shared `auth_token` before start | Yes |
| Idle / not homing / not moving gate | Yes |
| `http://` LAN URL only | Yes |
| Content-Length present and ≤ OTA slot | Yes |
| ESP image magic `0xE9` before body flash | Yes |
| `Update.end()` embedded app image checksum | Yes |
| TLS / HTTPS | **No** |
| Signed firmware / secure boot | **No** |
| Client-supplied hash as authentication | **No** (and must not be treated as such) |
| Application-managed automatic rollback | **No** |

### Recovery limitations (explicit)

Arduino-ESP32 / Espressif bootloader **may** boot the previous OTA slot if an update does not finalize. This firmware does **not** implement an additional application-level rollback manager. Treat **USB serial download as the mandatory recovery path** until a full OTA success + failure drill is proven on the actual Super Mini units.

Initial HTTP `GET` (headers/status) can still block up to the HTTP client timeout while idle; body transfer is chunked.

Local Wi-Fi risk: any host that knows the token and can reach the node can request OTA. Keep the LAN trusted.

## Building an artifact

```bash
pio run -e swarm_s3_4mb_ota
# .pio/build/swarm_s3_4mb_ota/firmware.bin
python3 -m http.server 8000
```
