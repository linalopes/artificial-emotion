# track_infeasible vs coordinator cancel (investigation only)

No firmware change in this iteration.

## Paths that raise `FaultCode::TrackInfeasible` (firmware 0.3.5)

All in `TrackPlayer::service()` / `beginSegment()`:

1. Loop restart (`passIndex_ > 0`) and `position_->steps() != first` keyframe steps (exact match).
2. Prelude `moveToSteps(first, …)` fails.
3. `beginSegment(0)` fails after prelude.
4. `beginSegment` after prelude index `-2` fails.
5. Timed `beginSegment(nextFrom)` fails (soft limits / invalid position / busy).

`TrackPlayer::stop()` (used by `cancel_run` / stop) only requests a controlled stop and clears autonomous policy. It does **not** call `enterFault(TrackInfeasible)`.

## Could Mac cancel/stop explain nine-wide `track_infeasible`?

**No — not directly.** Cancel/stop cannot set that fault code.  
Nine modules showing `track_infeasible` implies each module’s track player hit one of the paths above while still in Playing/SegmentActive (or a later local continuation).

**Indirect link (hypothesis, unproven):** Mac `failRun` after Mau07 disconnect sent cancel+stop to the other eight, stopping them cleanly (no that fault). Mau07 (and/or others already mid-loop) later hit exact-step loop closure independently. Durable logs for that window were lost; leave loop-closure tolerance unchanged until Serial evidence exists.

## Position invalidation

`ModuleStateMachine::enterFault` sets `positionValid_ = false`. UI unknown position follows any FAULT, including `track_infeasible`.
