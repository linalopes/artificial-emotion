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
 * Apply firmware defaults so continuous runs always carry an explicit runtime bound.
 * continuous + maxRuntimeMs==0 → SWARM_AUTONOMOUS_MAX_RUNTIME_MS (12 h).
 * Call before validate/store at prepare.
 */
inline void normalizeAutonomousPolicy(AutonomousPolicy* p) {
  if (!p) {
    return;
  }
  if (p->continuous && p->maxRuntimeMs == 0) {
    p->maxRuntimeMs = SWARM_AUTONOMOUS_MAX_RUNTIME_MS;
  }
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

/**
 * Steps allowed at a loop boundary before FAULT, derived from SWARM_LOOP_CLOSURE_MM
 * (same mechanical closure used for track_not_loop_compatible). Never invents a looser gate.
 */
inline int32_t loopClosureToleranceSteps(float stepsPerMm,
                                         float closureMm = SWARM_LOOP_CLOSURE_MM) {
  if (!(stepsPerMm > 0.0f) || !(closureMm > 0.0f)) {
    return 1;
  }
  const float raw = closureMm * stepsPerMm;
  int32_t steps = static_cast<int32_t>(raw + 0.999999f);  // ceil without <cmath> dependency here
  if (steps < 1) {
    steps = 1;
  }
  return steps;
}

enum class LoopBoundaryAction : uint8_t {
  AtStart = 0,
  /** Residual within LOOP_CLOSURE_MM — physical prelude to first keyframe (no model snap). */
  CorrectivePrelude = 1,
  Fault = 2,
};

/** Wire / telemetry labels for loop-boundary decisions (status payload). */
inline const char* loopBoundaryActionLabel(LoopBoundaryAction a) {
  switch (a) {
    case LoopBoundaryAction::AtStart:
      return "CONTINUE";
    case LoopBoundaryAction::CorrectivePrelude:
      return "CORRECT";
    case LoopBoundaryAction::Fault:
    default:
      return "FAULT";
  }
}

/**
 * Decide loop-restart behaviour when passIndex > 0.
 * actualSteps is the planner position model; firstSteps is mmToSteps(frames[0].zMm).
 */
inline LoopBoundaryAction decideLoopBoundary(int32_t actualSteps, int32_t firstSteps,
                                             int32_t toleranceSteps) {
  int32_t d = actualSteps - firstSteps;
  if (d < 0) {
    d = -d;
  }
  if (d == 0) {
    return LoopBoundaryAction::AtStart;
  }
  if (toleranceSteps > 0 && d <= toleranceSteps) {
    return LoopBoundaryAction::CorrectivePrelude;
  }
  return LoopBoundaryAction::Fault;
}

/**
 * When a segment planner becomes idle: only Advance if the move actually reached its target.
 * IncompleteStop / controlled-stop-without-arrival must ResumeTarget — never treat as complete.
 */
enum class SegmentIdleAction : uint8_t {
  Advance = 0,
  ResumeTarget = 1,
};

inline SegmentIdleAction decideSegmentIdleAction(bool targetReached) {
  return targetReached ? SegmentIdleAction::Advance : SegmentIdleAction::ResumeTarget;
}

inline const char* segmentCompletionLabel(SegmentIdleAction a, bool resumeFailed) {
  if (a == SegmentIdleAction::Advance) {
    return "reached";
  }
  return resumeFailed ? "incomplete_fault" : "incomplete_resumed";
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

/**
 * Planner / coil side of coordinator disconnect (ProtocolClient::handleDisconnectPolicy).
 *
 * Critical: when an authorized autonomous run is already executing, never request a
 * controlled stop or enter STOPPING — even if the planner is BUSY and the NVS
 * disconnect policy is ControlledStop. TrackPlayer may preserve the run while the
 * protocol layer previously still stopped the motor (0.3.8 physical regression).
 */
enum class DisconnectMotorAction : uint8_t {
  None = 0,
  ContinueAutonomous,
  AbortHoming,
  FinishCurrentMotion,
  ControlledStop,
};

inline DisconnectMotorAction decideDisconnectMotorAction(bool autonomySurvives, bool homeActive,
                                                         bool plannerBusy, bool finishSegmentPolicy) {
  if (autonomySurvives) {
    return DisconnectMotorAction::ContinueAutonomous;
  }
  if (homeActive) {
    return DisconnectMotorAction::AbortHoming;
  }
  if (!plannerBusy) {
    return DisconnectMotorAction::None;
  }
  return finishSegmentPolicy ? DisconnectMotorAction::FinishCurrentMotion
                             : DisconnectMotorAction::ControlledStop;
}

}  // namespace swarm
