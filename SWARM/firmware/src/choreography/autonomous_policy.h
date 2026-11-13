#pragma once

#include <math.h>
#include <stdint.h>

#include <swarm_limits.h>

namespace swarm {

/** Run-scoped autonomous authorization. Cleared on reset/cancel/fault/reboot — never global. */
struct AutonomousPolicy {
  bool autonomous = false;
  bool loop = false;
  /** Explicit continuous loop (still constrained by local safety). Default false. */
  bool continuous = false;
  /** Finite loop count. 0 means "not using loop count" (must use runtime or continuous). */
  uint32_t maxLoops = 0;
  /** Wall of monotonic runtime from epoch start. 0 = no runtime cap. */
  uint32_t maxRuntimeMs = 0;
};

inline void clearAutonomousPolicy(AutonomousPolicy* p) {
  if (!p) {
    return;
  }
  *p = AutonomousPolicy{};
}

/**
 * Validate policy fields. Returns false and sets reason on rejection.
 * Non-autonomous policies must not enable loop/continuous.
 */
inline bool validateAutonomousPolicy(const AutonomousPolicy& p, const char** reason) {
  if (!p.autonomous) {
    if (p.loop || p.continuous || p.maxLoops != 0 || p.maxRuntimeMs != 0) {
      if (reason) {
        *reason = "autonomous_fields_without_autonomous";
      }
      return false;
    }
    return true;
  }
  if (p.continuous && !p.loop) {
    if (reason) {
      *reason = "continuous_requires_loop";
    }
    return false;
  }
  if (p.maxLoops > SWARM_AUTONOMOUS_MAX_LOOPS_CAP) {
    if (reason) {
      *reason = "max_loops_too_large";
    }
    return false;
  }
  if (p.maxRuntimeMs > SWARM_AUTONOMOUS_MAX_RUNTIME_MS) {
    if (reason) {
      *reason = "max_runtime_too_large";
    }
    return false;
  }
  if (p.loop) {
    if (!p.continuous && p.maxLoops == 0 && p.maxRuntimeMs == 0) {
      if (reason) {
        *reason = "loop_requires_bound_or_continuous";
      }
      return false;
    }
    if (!p.continuous && p.maxRuntimeMs != 0 && p.maxRuntimeMs < SWARM_AUTONOMOUS_MIN_RUNTIME_MS) {
      if (reason) {
        *reason = "max_runtime_too_short";
      }
      return false;
    }
  } else if (p.maxLoops != 0) {
    if (reason) {
      *reason = "max_loops_without_loop";
    }
    return false;
  }
  return true;
}

/** First/last keyframe z must match for seamless loop (no auto jump). */
inline bool trackLoopCompatible(float firstZMm, float lastZMm, float toleranceMm = SWARM_LOOP_CLOSURE_MM) {
  return fabsf(firstZMm - lastZMm) <= toleranceMm;
}

/** Elapsed time on the shared epoch for pass `passIndex` (0-based) at keyframe local time. */
inline uint32_t epochOffsetMs(uint32_t passIndex, uint32_t trackDurationMs, uint32_t keyframeTimeMs) {
  return passIndex * trackDurationMs + keyframeTimeMs;
}

/** Whether another loop may begin after completing `completedPasses` (1 after first play). */
inline bool mayStartNextLoop(const AutonomousPolicy& p, uint32_t completedPasses, uint32_t elapsedSinceEpochMs) {
  if (!p.autonomous || !p.loop) {
    return false;
  }
  if (p.maxRuntimeMs != 0 && elapsedSinceEpochMs >= p.maxRuntimeMs) {
    return false;
  }
  if (p.continuous) {
    return true;
  }
  if (p.maxLoops != 0) {
    return completedPasses < p.maxLoops;
  }
  // Runtime-only bound (no max_loops): continue while under max_runtime_ms.
  if (p.maxRuntimeMs != 0) {
    return elapsedSinceEpochMs < p.maxRuntimeMs;
  }
  return false;
}

enum class DisconnectPlayAction : uint8_t {
  Ignore = 0,
  CancelBeforeStart,
  FinishSegmentThenStop,
  ControlledStop,
  ContinueAutonomous,
};

/**
 * Decide disconnect behaviour for the track player.
 * autonomousStarted: commit succeeded and local start has occurred (Running).
 */
inline DisconnectPlayAction decideDisconnectAction(bool trackArmedOrWaitingStart, bool segmentActive,
                                                   bool autonomousStarted, bool finishSegmentPolicy) {
  if (autonomousStarted) {
    return DisconnectPlayAction::ContinueAutonomous;
  }
  if (trackArmedOrWaitingStart) {
    return DisconnectPlayAction::CancelBeforeStart;
  }
  if (segmentActive) {
    return finishSegmentPolicy ? DisconnectPlayAction::FinishSegmentThenStop
                               : DisconnectPlayAction::ControlledStop;
  }
  return DisconnectPlayAction::Ignore;
}

}  // namespace swarm
