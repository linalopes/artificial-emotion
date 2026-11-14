#pragma once

#include <Arduino.h>

#include "motor_driver.h"
#include "step_schedule.h"
#include "../config/config_store.h"
#include "../position/position.h"
#include "../sensing/endstop.h"

namespace swarm {

enum class PlannerStatus : uint8_t {
  Idle = 0,
  Moving,
  Stopping,
  Faulted,
};

enum class StallOutcome : uint8_t {
  None = 0,
  IncompleteStop,   // stopped mid-move; estimated position retained; target NOT reached
  PositionInvalid,  // stall during raw/homing or integrity lost
};

// Non-blocking planner. At most one step per service() call. Missed deadlines never burst.
// Position moves clamp to hardMaxRpm; raw/homing moves clamp to SWARM_ABS_MAX_HOME_RPM.
class MotionPlanner {
 public:
  void begin(MotorDriver* motor, PositionModel* position, ConfigStore* config, Endstop* endstop);

  PlannerStatus status() const { return status_; }
  bool isBusy() const { return status_ == PlannerStatus::Moving || status_ == PlannerStatus::Stopping; }
  StallOutcome lastStall() const { return lastStall_; }
  void clearStall() { lastStall_ = StallOutcome::None; }
  bool targetReached() const { return targetReached_; }

  bool moveToSteps(int32_t targetSteps, float speedRpm, float accelMmS2, String* error);
  bool moveRelativeSteps(int32_t deltaSteps, float speedRpm, float accelMmS2, String* error);

  bool startRawMove(int8_t motorDirection, uint32_t maxSteps, float speedRpm, String* error);
  uint32_t rawStepsTaken() const { return rawStepsTaken_; }
  void cancelRaw();

  void requestControlledStop();
  void emergencyReleaseStop();

  void service();
  void applyRestPolicy();

  bool hitUnexpectedEndstop() const { return unexpectedEndstop_; }
  void clearUnexpectedEndstop() { unexpectedEndstop_ = false; }

  // Immediate halt of raw retract when NC opens (homing); does not complete the raw budget.
  void haltRawImmediate();

 private:
  MotorDriver* motor_ = nullptr;
  PositionModel* position_ = nullptr;
  ConfigStore* config_ = nullptr;
  Endstop* endstop_ = nullptr;

  PlannerStatus status_ = PlannerStatus::Idle;
  bool rawMode_ = false;
  bool unexpectedEndstop_ = false;
  StallOutcome lastStall_ = StallOutcome::None;
  bool targetReached_ = false;

  int32_t targetSteps_ = 0;
  int32_t startSteps_ = 0;
  int8_t moveSign_ = 0;
  int8_t motorDir_ = 0;

  float cruiseStepsPerSec_ = 0;
  float accelStepsPerSec2_ = 0;
  float currentStepsPerSec_ = 0;
  uint32_t lastStepMicros_ = 0;
  uint32_t stepIntervalUs_ = 0;

  uint32_t rawMaxSteps_ = 0;
  uint32_t rawStepsTaken_ = 0;

  void computeInterval();
  void finishIdle(bool reachedTarget);
  void abortStall(StallOutcome outcome);
  int8_t positionDirToMotor(int8_t positionDir) const;
  bool issueOneStep();
};

}  // namespace swarm
