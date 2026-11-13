#pragma once

#include <Arduino.h>

#include "../config/config_store.h"
#include "../motor/motion_planner.h"
#include "../position/position.h"
#include "../sensing/endstop.h"
#include "../system/faults.h"
#include "../system/module_state.h"

namespace swarm {

enum class HomePhase : uint8_t {
  Idle = 0,
  RecoveryProbe,
  SeekOpen,
  SeekOpenConfirm,  // raw open seen; wait for debounced open before backoff
  BackoffClose,
  ApplyOffset,
  Complete,
  Failed,
};

class HomeController {
 public:
  void begin(MotionPlanner* planner, Endstop* endstop, PositionModel* position,
             ConfigStore* config, ModuleStateMachine* state);

  bool start(String* error);
  void service();
  void abort(FaultCode code);
  // Operator stop: leave UNHOMED without FAULT when possible.
  void abortToUnhomed();

  bool active() const {
    return phase_ != HomePhase::Idle && phase_ != HomePhase::Complete &&
           phase_ != HomePhase::Failed;
  }
  HomePhase phase() const { return phase_; }
  FaultCode lastFault() const { return lastFault_; }

 private:
  MotionPlanner* planner_ = nullptr;
  Endstop* endstop_ = nullptr;
  PositionModel* position_ = nullptr;
  ConfigStore* config_ = nullptr;
  ModuleStateMachine* state_ = nullptr;

  HomePhase phase_ = HomePhase::Idle;
  FaultCode lastFault_ = FaultCode::None;
  uint32_t startedAtMs_ = 0;
  uint32_t phaseStepsBudget_ = 0;
  uint32_t confirmStartedMs_ = 0;

  void enterFault(FaultCode code);
  bool timedOut() const;
  void startSeekOpen();
  void startBackoff();
  void startOffset();
};

}  // namespace swarm
