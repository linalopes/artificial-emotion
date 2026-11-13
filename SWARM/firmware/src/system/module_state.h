#pragma once

#include <Arduino.h>

#include "faults.h"

namespace swarm {

enum class ModuleState : uint8_t {
  Boot = 0,
  Connecting,
  Unhomed,
  Homing,
  Ready,
  Moving,
  Stopping,
  Fault,
  Updating,
};

inline const char* stateToString(ModuleState state) {
  switch (state) {
    case ModuleState::Boot:
      return "BOOT";
    case ModuleState::Connecting:
      return "CONNECTING";
    case ModuleState::Unhomed:
      return "UNHOMED";
    case ModuleState::Homing:
      return "HOMING";
    case ModuleState::Ready:
      return "READY";
    case ModuleState::Moving:
      return "MOVING";
    case ModuleState::Stopping:
      return "STOPPING";
    case ModuleState::Fault:
      return "FAULT";
    case ModuleState::Updating:
      return "UPDATING";
    default:
      return "UNKNOWN";
  }
}

class ModuleStateMachine {
 public:
  void begin();
  ModuleState state() const { return state_; }
  FaultCode fault() const { return fault_; }
  bool positionValid() const { return positionValid_; }

  void setConnecting();
  void setUnhomed();
  void setHoming();
  void setReady();
  void setMoving();
  void setStopping();
  void setUpdating();
  void enterFault(FaultCode code);
  void clearFault();  // does NOT set positionValid
  void invalidatePosition();
  void markPositionValid();

  bool canHome() const;
  bool canMoveAbsolute() const;
  bool canStartTrack() const;
  bool canOta() const;
  bool isIdleForConfig() const;

 private:
  ModuleState state_ = ModuleState::Boot;
  FaultCode fault_ = FaultCode::None;
  bool positionValid_ = false;
};

}  // namespace swarm
