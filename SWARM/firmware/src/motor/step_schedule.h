#pragma once

#include <stdint.h>

#include <swarm_limits.h>

namespace swarm {

enum class ScheduleAction : uint8_t {
  Wait = 0,           // not time for a step yet
  Step,               // take exactly one step at configured interval
  StepResync,         // take one step, then resync timeline to now (late but no burst)
  StallAbort,         // excessive delay — stop without completing target
};

struct ScheduleDecision {
  ScheduleAction action;
  uint32_t nextLastStepMicros;
};

// Pure scheduling helper (host-testable). Uses unsigned wrap-safe elapsed = now - last.
inline uint32_t elapsedMicros(uint32_t now, uint32_t then) {
  return static_cast<uint32_t>(now - then);
}

inline ScheduleDecision evaluateStepSchedule(uint32_t nowMicros, uint32_t lastStepMicros,
                                             uint32_t stepIntervalUs,
                                             uint32_t stallAbortUs = SWARM_STALL_ABORT_US) {
  ScheduleDecision d{};
  d.nextLastStepMicros = lastStepMicros;

  if (stepIntervalUs == 0) {
    stepIntervalUs = 1;
  }

  const uint32_t elapsed = elapsedMicros(nowMicros, lastStepMicros);

  if (elapsed < stepIntervalUs) {
    d.action = ScheduleAction::Wait;
    return d;
  }

  if (elapsed >= stallAbortUs) {
    d.action = ScheduleAction::StallAbort;
    d.nextLastStepMicros = nowMicros;
    return d;
  }

  // Late but recoverable: never issue more than one step; resync so we do not burst.
  if (elapsed >= (stepIntervalUs * 2u)) {
    d.action = ScheduleAction::StepResync;
    d.nextLastStepMicros = nowMicros;
    return d;
  }

  d.action = ScheduleAction::Step;
  d.nextLastStepMicros = lastStepMicros + stepIntervalUs;
  return d;
}

}  // namespace swarm
