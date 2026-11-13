#include "motion_planner.h"

#include <math.h>

#include <swarm_limits.h>
#include "../util/log.h"
#include "../util/timing.h"

namespace swarm {

void MotionPlanner::begin(MotorDriver* motor, PositionModel* position, ConfigStore* config,
                          Endstop* endstop) {
  motor_ = motor;
  position_ = position;
  config_ = config;
  endstop_ = endstop;
  status_ = PlannerStatus::Idle;
  rawMode_ = false;
  unexpectedEndstop_ = false;
  lastStall_ = StallOutcome::None;
  targetReached_ = false;
}

int8_t MotionPlanner::positionDirToMotor(int8_t positionDir) const {
  const int8_t retract = config_->get().retractDirection;
  return static_cast<int8_t>((positionDir < 0) ? retract : -retract);
}

void MotionPlanner::computeInterval() {
  if (currentStepsPerSec_ < 1.0f) {
    currentStepsPerSec_ = 1.0f;
  }
  stepIntervalUs_ = static_cast<uint32_t>(1000000.0f / currentStepsPerSec_);
  if (stepIntervalUs_ < 200) {
    stepIntervalUs_ = 200;
  }
}

bool MotionPlanner::moveToSteps(int32_t targetSteps, float speedRpm, float accelMmS2,
                                String* error) {
  if (!position_->valid()) {
    if (error) {
      *error = "position invalid";
    }
    return false;
  }
  if (isBusy()) {
    if (error) {
      *error = "planner busy";
    }
    return false;
  }

  const int32_t minS = position_->softMinSteps();
  const int32_t maxS = position_->softMaxSteps(*config_);
  if (targetSteps < minS || targetSteps > maxS) {
    if (error) {
      *error = "target outside soft limits";
    }
    return false;
  }

  const int32_t current = position_->steps();
  const int32_t delta = targetSteps - current;
  if (delta == 0) {
    finishIdle(true);
    return true;
  }

  const float rpm = constrain(speedRpm, 0.1f, config_->get().hardMaxRpm);
  const float accel = constrain(accelMmS2, 0.1f, config_->get().hardMaxAccelMmS2);

  startSteps_ = current;
  targetSteps_ = targetSteps;
  moveSign_ = (delta > 0) ? 1 : -1;
  motorDir_ = positionDirToMotor(moveSign_);
  cruiseStepsPerSec_ = config_->rpmToStepsPerSec(rpm);
  accelStepsPerSec2_ = config_->mmS2ToStepsS2(accel);
  currentStepsPerSec_ = cruiseStepsPerSec_ * 0.15f;
  if (currentStepsPerSec_ < 5.0f) {
    currentStepsPerSec_ = 5.0f;
  }
  computeInterval();
  lastStepMicros_ = micros();
  rawMode_ = false;
  status_ = PlannerStatus::Moving;
  unexpectedEndstop_ = false;
  lastStall_ = StallOutcome::None;
  targetReached_ = false;
  return true;
}

bool MotionPlanner::moveRelativeSteps(int32_t deltaSteps, float speedRpm, float accelMmS2,
                                      String* error) {
  if (!position_->valid()) {
    if (error) {
      *error = "position invalid";
    }
    return false;
  }
  return moveToSteps(position_->steps() + deltaSteps, speedRpm, accelMmS2, error);
}

bool MotionPlanner::startRawMove(int8_t motorDirection, uint32_t maxSteps, float speedRpm,
                                 String* error) {
  if (isBusy()) {
    if (error) {
      *error = "planner busy";
    }
    return false;
  }
  if (motorDirection == 0 || maxSteps == 0) {
    if (error) {
      *error = "invalid raw move";
    }
    return false;
  }

  motorDir_ = motorDirection;
  moveSign_ = 0;
  rawMode_ = true;
  rawMaxSteps_ = maxSteps;
  rawStepsTaken_ = 0;
  cruiseStepsPerSec_ = config_->rpmToStepsPerSec(constrain(speedRpm, 0.1f, config_->get().hardMaxRpm));
  accelStepsPerSec2_ = 0;
  currentStepsPerSec_ = cruiseStepsPerSec_;
  computeInterval();
  lastStepMicros_ = micros();
  status_ = PlannerStatus::Moving;
  lastStall_ = StallOutcome::None;
  targetReached_ = false;
  return true;
}

void MotionPlanner::cancelRaw() {
  if (rawMode_) {
    finishIdle(false);
  }
}

void MotionPlanner::haltRawImmediate() {
  // M7: immediate coil release — independent of controlled deceleration path.
  motor_->release();
  status_ = PlannerStatus::Idle;
  rawMode_ = false;
  targetReached_ = false;
  applyRestPolicy();
}

void MotionPlanner::requestControlledStop() {
  // Controlled stop applies to position-mode moves only. Raw/homing must use
  // haltRawImmediate / emergencyReleaseStop so seek cannot keep stepping.
  if (rawMode_) {
    haltRawImmediate();
    return;
  }
  if (status_ == PlannerStatus::Moving) {
    status_ = PlannerStatus::Stopping;
    targetReached_ = false;
  }
}

void MotionPlanner::emergencyReleaseStop() {
  // M7: hard stop — no further steps regardless of prior Moving/Stopping/raw.
  motor_->release();
  status_ = PlannerStatus::Idle;
  rawMode_ = false;
  motorDir_ = 0;
  moveSign_ = 0;
  targetReached_ = false;
}

void MotionPlanner::finishIdle(bool reachedTarget) {
  status_ = PlannerStatus::Idle;
  rawMode_ = false;
  targetReached_ = reachedTarget;
  applyRestPolicy();
}

void MotionPlanner::abortStall(StallOutcome outcome) {
  lastStall_ = outcome;
  targetReached_ = false;
  if (outcome == StallOutcome::PositionInvalid) {
    position_->invalidate();
    motor_->release();
    status_ = PlannerStatus::Faulted;
    rawMode_ = false;
    SWARM_LOG("Planner stall: position invalidated");
    return;
  }
  // IncompleteStop: retain estimated position; do not claim target reached.
  SWARM_LOG("Planner stall: controlled incomplete stop at steps=%ld",
            static_cast<long>(position_->steps()));
  finishIdle(false);
}

void MotionPlanner::applyRestPolicy() {
  if (config_->get().coilHoldMode == CoilHoldMode::Hold) {
    motor_->hold();
  } else {
    motor_->release();
  }
}

bool MotionPlanner::issueOneStep() {
  // Upper hard limit: NC open while retracting in position mode.
  if (!rawMode_ && endstop_ && moveSign_ < 0 && !endstop_->rawClosed()) {
    unexpectedEndstop_ = true;
    motor_->release();
    status_ = PlannerStatus::Faulted;
    position_->invalidate();
    targetReached_ = false;
    return false;
  }

  motor_->step(motorDir_);

  if (rawMode_) {
    rawStepsTaken_++;
    if (rawStepsTaken_ >= rawMaxSteps_) {
      finishIdle(true);
    }
    return true;
  }

  position_->addSteps(moveSign_);

  if ((moveSign_ > 0 && position_->steps() >= targetSteps_) ||
      (moveSign_ < 0 && position_->steps() <= targetSteps_)) {
    position_->setSteps(targetSteps_);
    finishIdle(true);
  }
  return true;
}

void MotionPlanner::service() {
  if (status_ != PlannerStatus::Moving && status_ != PlannerStatus::Stopping) {
    return;
  }

  if (status_ == PlannerStatus::Stopping) {
    // Controlled stop: decelerate, still max one step per call, no catch-up burst.
    const uint32_t now = micros();
    const ScheduleDecision sched =
        evaluateStepSchedule(now, lastStepMicros_, stepIntervalUs_, SWARM_STALL_ABORT_US);
    if (sched.action == ScheduleAction::Wait) {
      return;
    }
    if (sched.action == ScheduleAction::StallAbort) {
      abortStall(rawMode_ ? StallOutcome::PositionInvalid : StallOutcome::IncompleteStop);
      return;
    }
    lastStepMicros_ = sched.nextLastStepMicros;
    currentStepsPerSec_ *= 0.85f;
    if (currentStepsPerSec_ < 20.0f) {
      finishIdle(false);
      return;
    }
    computeInterval();
    issueOneStep();
    return;
  }

  // Accel profile update for next interval (before scheduling step).
  if (!rawMode_ && accelStepsPerSec2_ > 0.0f) {
    const int32_t remaining = abs(targetSteps_ - position_->steps());
    const float stopDistance =
        (currentStepsPerSec_ * currentStepsPerSec_) / (2.0f * accelStepsPerSec2_);
    if (remaining <= static_cast<int32_t>(stopDistance + 1.0f)) {
      currentStepsPerSec_ -= accelStepsPerSec2_ * (stepIntervalUs_ / 1000000.0f);
      if (currentStepsPerSec_ < cruiseStepsPerSec_ * 0.1f) {
        currentStepsPerSec_ = cruiseStepsPerSec_ * 0.1f;
      }
    } else if (currentStepsPerSec_ < cruiseStepsPerSec_) {
      currentStepsPerSec_ += accelStepsPerSec2_ * (stepIntervalUs_ / 1000000.0f);
      if (currentStepsPerSec_ > cruiseStepsPerSec_) {
        currentStepsPerSec_ = cruiseStepsPerSec_;
      }
    }
    computeInterval();
  }

  const uint32_t now = micros();
  const ScheduleDecision sched =
      evaluateStepSchedule(now, lastStepMicros_, stepIntervalUs_, SWARM_STALL_ABORT_US);

  if (sched.action == ScheduleAction::Wait) {
    return;
  }
  if (sched.action == ScheduleAction::StallAbort) {
    // Position moves: retain estimate, incomplete. Raw/homing: invalidate.
    abortStall(rawMode_ ? StallOutcome::PositionInvalid : StallOutcome::IncompleteStop);
    return;
  }

  lastStepMicros_ = sched.nextLastStepMicros;
  issueOneStep();
}

}  // namespace swarm
