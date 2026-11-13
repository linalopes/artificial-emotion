#pragma once

// Immutable compile-time absolute maxima. NVS / remote config may never exceed these.
// These are firmware safety clamps — not physically validated operating points.

#ifndef SWARM_ABS_MAX_RPM
#define SWARM_ABS_MAX_RPM 8.0f
#endif

#ifndef SWARM_ABS_MAX_ACCEL_MM_S2
#define SWARM_ABS_MAX_ACCEL_MM_S2 250.0f
#endif

#ifndef SWARM_ABS_MAX_TRAVEL_MM
#define SWARM_ABS_MAX_TRAVEL_MM 1500.0f
#endif

#ifndef SWARM_ABS_MAX_HOME_SEARCH_STEPS
#define SWARM_ABS_MAX_HOME_SEARCH_STEPS 500000u
#endif

#ifndef SWARM_ABS_MAX_HOME_RECOVERY_STEPS
#define SWARM_ABS_MAX_HOME_RECOVERY_STEPS 50000u
#endif

#ifndef SWARM_ABS_MAX_HOME_TIMEOUT_MS
#define SWARM_ABS_MAX_HOME_TIMEOUT_MS 600000u
#endif

#ifndef SWARM_MAX_WS_MESSAGE_BYTES
#define SWARM_MAX_WS_MESSAGE_BYTES 2048u
#endif

#ifndef SWARM_MAX_SERIAL_LINE_BYTES
#define SWARM_MAX_SERIAL_LINE_BYTES 512u
#endif

#ifndef SWARM_JSON_DOC_CAPACITY
#define SWARM_JSON_DOC_CAPACITY 2048u
#endif

#ifndef SWARM_STATUS_MIN_INTERVAL_MS
#define SWARM_STATUS_MIN_INTERVAL_MS 1000u
#endif

#ifndef SWARM_MAX_STEPS_PER_SERVICE
#define SWARM_MAX_STEPS_PER_SERVICE 1u
#endif

#ifndef SWARM_STALL_ABORT_US
#define SWARM_STALL_ABORT_US 100000u
#endif

#ifndef SWARM_START_AT_MAX_DELAY_MS
#define SWARM_START_AT_MAX_DELAY_MS 120000u
#endif

#ifndef SWARM_IDEMPOTENCY_CAPACITY
#define SWARM_IDEMPOTENCY_CAPACITY 16u
#endif

// Clock sync (Phase A.3) — thresholds are software gates, not measured accuracy claims.
#ifndef SWARM_CLOCK_SAMPLE_CAPACITY
#define SWARM_CLOCK_SAMPLE_CAPACITY 8u
#endif

#ifndef SWARM_CLOCK_DEFAULT_UNCERTAINTY_MAX_US
#define SWARM_CLOCK_DEFAULT_UNCERTAINTY_MAX_US 20000u  // 20 ms conservative gate
#endif

#ifndef SWARM_CLOCK_ABS_MIN_UNCERTAINTY_MAX_US
#define SWARM_CLOCK_ABS_MIN_UNCERTAINTY_MAX_US 5000u
#endif

#ifndef SWARM_CLOCK_ABS_MAX_UNCERTAINTY_MAX_US
#define SWARM_CLOCK_ABS_MAX_UNCERTAINTY_MAX_US 100000u
#endif

#ifndef SWARM_CLOCK_MAX_RTT_US
#define SWARM_CLOCK_MAX_RTT_US 200000u  // reject samples with RTT > 200 ms
#endif

#ifndef SWARM_CLOCK_STALE_MS
#define SWARM_CLOCK_STALE_MS 30000u  // sync invalid if no valid sample within 30 s
#endif

#ifndef SWARM_COMMIT_MIN_LEAD_US
#define SWARM_COMMIT_MIN_LEAD_US 200000u  // start must be >= 200 ms in the future
#endif

#ifndef SWARM_COMMIT_MAX_LEAD_US
#define SWARM_COMMIT_MAX_LEAD_US 120000000ull  // 120 s scheduling horizon
#endif

#ifndef SWARM_RUN_ID_MAX
#define SWARM_RUN_ID_MAX 32u
#endif

// Autonomous playback (Phase B.2)
#ifndef SWARM_LOOP_CLOSURE_MM
#define SWARM_LOOP_CLOSURE_MM 1.0f  // first/last keyframe must match within this for looping
#endif

#ifndef SWARM_AUTONOMOUS_MAX_LOOPS_CAP
#define SWARM_AUTONOMOUS_MAX_LOOPS_CAP 10000u
#endif

#ifndef SWARM_AUTONOMOUS_MAX_RUNTIME_MS
#define SWARM_AUTONOMOUS_MAX_RUNTIME_MS (12u * 60u * 60u * 1000u)  // 12 h software ceiling
#endif

#ifndef SWARM_AUTONOMOUS_MIN_RUNTIME_MS
#define SWARM_AUTONOMOUS_MIN_RUNTIME_MS 1000u
#endif
