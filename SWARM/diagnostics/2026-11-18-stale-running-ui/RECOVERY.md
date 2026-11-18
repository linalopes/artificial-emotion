# Recovery — stale RUNNING cleared

**When:** 2026-11-18  
**Run:** `27fb9395b1d644a0b639594eb81a111`

## Outcome

- Coordinator hot-reloaded with status-reconcile fix → in-memory run reset to **`phase=idle`**.
- Perform **unlocked** (no STOP / cancel / motor commands issued).
- All nine modules remain idle with `completionReason=max_loops`, `completedPasses=3`.
- Durable `run_complete` appended with `reconcileSource=status_reconcile_after_reload` (history preserved).

## Fix shipped (not committed)

- `autonomous-completion.ts` — pure status→finished gate (fresh + reason + passes).
- `coordinator.ts` — reconcile on telemetry; `reconcileAutonomousCompletionFromFleet()`; finish without device cmds.
- `POST /api/run-reconcile` — bookkeeping-only recovery endpoint.
- Tests: 38 passed (unit + coordinator regressions).
