# Firmware integration: what is needed, and what is not known

For the firmware consultant. This replaces, for now, the firmware compatibility report and the
autonomous-playback handoff that were requested. Neither can be written honestly yet.

## Why

The application was built without access to SWARM firmware v0.2.0. The public repository
`linalopes/artificial-emotion` contains no `SWARM/` folder (checked on its `main` branch, commit `6c8a450`,
13 November 2026), and the local project folder was not reachable. Nothing below describes the firmware.
It describes the coordinator, and the questions the firmware source must answer.

## What exists on the coordinator side

- `coordinator/src/devices/protocol.ts` defines the coordinator's internal commands and events. They are
  not a wire format.
- `coordinator/src/devices/server.ts` handles registration, duplicate-identity rejection, acknowledgment
  tracking with timeouts, and the coordinator half of a four-timestamp clock exchange.
- A `Codec` turns internal commands into bytes. The only codec is `sim-codec.ts`, tagged `swarm-sim/0`,
  spoken by the simulated nodes. It was invented for the simulator and a real node will not understand it.

Connecting hardware means writing one new codec from `PROTOCOL.md`, then adjusting the coordinator where the
real protocol differs in meaning, not only in spelling. The second part may be substantial.

## Internal commands that need a firmware equivalent

| Internal command | Used for | To confirm in the firmware |
|---|---|---|
| `home` | Home selected, Home all | Message name; what the acknowledgment means (accepted or completed) |
| `move {targetMm}` | Move selected, Go to start | Units (mm or steps); behaviour when unhomed or out of limits |
| `stop` | Stop selected, Stop all, software stop, run failure | Whether it also cancels an armed or running trajectory |
| `set_params {rpm, accelMmS2}` | Speed and acceleration sliders | Parameter names, units, permitted ranges, persistence |
| `clear_fault` | Clear fault | Whether this exists at all |
| `load_trajectory {runId, durationMs, keyframes}` | Sending a score | Format, maximum points, interpolation, chunking |
| `prepare {runId}` | Readiness | Exact prepare semantics and reply |
| `commit {runId, startAtNodeMs}` | Shared start | Which clock the timestamp is in; whether arm is a separate message |
| `cancel {runId}` | Abort before or during a run | Exact cancel semantics |

The coordinator currently expects one acknowledgment per command, matched by a message id, and treats a
missing acknowledgment within 1.5 s as failure. It never retries. The firmware's idempotency rules and
protocol version handshake are not implemented because they are not known.

Events the coordinator expects from a node: an identity announcement, acknowledgments, periodic telemetry
(position, target, homed, homing, moving, endstop, fault code, RSSI, speed, acceleration, travel limits),
clock replies, and run status (running, finished, aborted).

## Behaviour the simulator assumes

Each of these was a guess, made so the application could be exercised end to end:

1. A node keeps moving, and keeps running a committed trajectory, when the coordinator disconnects.
2. A node reports no position until it has homed.
3. A node refuses `move`, `load_trajectory` and `prepare` while unhomed, and everything but stop, cancel,
   parameters and fault clearing while faulted.
4. A node follows a trajectory by tracking its keyframes, limited only by its top speed.
5. A node reports `finished` when its trajectory ends, and `aborted` when stopped, cancelled or faulted mid-run.
6. The commit timestamp is expressed on the node's own clock; the coordinator converts using its offset estimate.
7. Trajectories are linear keyframes one second apart: 241 points per node for a four-minute Wave.

If the firmware differs on any of these, the simulator should be changed to match before trusting the tests.

## Autonomous playback: not assessed

The requirement is that a choreography keeps running after the Mac is switched off. Questions A to E of the
brief (finishing a scheduled move, finishing an uploaded choreography, repeating it, staying synchronised,
recovering from a reboot, all without the coordinator) can only be answered from `TrackPlayer`,
`RunController` and the Wi-Fi and clock code. None of that has been read.

What can be said from the coordinator side, independent of the firmware:

- The coordinator is the only time reference. Nodes are synchronised to it, not to each other.
- A looping live run is implemented as the coordinator re-arming the score after every pass. That stops the
  moment the Mac stops.
- Faults and disconnections during a run are detected and acted on by the coordinator. Without it, nothing
  in this application stops the other eight modules when one fails.
- Nothing in this application stores a choreography on a node for later.

So with this application as it stands, switching the Mac off ends looping and supervision regardless of
what the firmware can do. Whether a single pass survives depends on assumption 1 above.

## Questions for the firmware consultant

1. Does a node connect to the coordinator as a WebSocket client, on which path, and how does it find the address?
2. What is the protocol version handshake, and what are the idempotency rules for repeated message ids?
3. What does a node do on losing the coordinator: while idle, while moving to a target, while armed, while running?
4. Can a node repeat a loaded trajectory by itself? Is there any loop or repeat field?
5. How many trajectory points can a node hold, and is the trajectory kept across a reboot?
6. Does position survive a reboot, or must every node home again?
7. Which clock is the start timestamp in, and what does a node do when its clock estimate is stale at start time?
8. Is there a fault-clearing command? Which faults latch?
9. Are travel limits and maximum speed enforced in firmware, and can they be changed remotely?
10. What are the acknowledgment semantics of homing and moves: accepted, or completed?
