#include "module_state.h"

namespace swarm {

void ModuleStateMachine::begin() {
  state_ = ModuleState::Boot;
  fault_ = FaultCode::None;
  positionValid_ = false;
}

void ModuleStateMachine::setConnecting() {
  if (state_ != ModuleState::Fault && state_ != ModuleState::Updating) {
    state_ = ModuleState::Connecting;
  }
}

void ModuleStateMachine::setUnhomed() {
  if (state_ != ModuleState::Fault && state_ != ModuleState::Updating) {
    state_ = ModuleState::Unhomed;
    positionValid_ = false;
  }
}

void ModuleStateMachine::setHoming() { state_ = ModuleState::Homing; }

void ModuleStateMachine::setReady() {
  state_ = ModuleState::Ready;
  fault_ = FaultCode::None;
}

void ModuleStateMachine::setMoving() { state_ = ModuleState::Moving; }

void ModuleStateMachine::setStopping() { state_ = ModuleState::Stopping; }

void ModuleStateMachine::setUpdating() { state_ = ModuleState::Updating; }

void ModuleStateMachine::enterFault(FaultCode code) {
  fault_ = code;
  state_ = ModuleState::Fault;
  positionValid_ = false;
}

void ModuleStateMachine::clearFault() {
  if (state_ == ModuleState::Fault) {
    fault_ = FaultCode::None;
    state_ = ModuleState::Unhomed;
    positionValid_ = false;
  }
}

void ModuleStateMachine::invalidatePosition() { positionValid_ = false; }

void ModuleStateMachine::markPositionValid() { positionValid_ = true; }

bool ModuleStateMachine::canHome() const {
  // L3: home only from stable idle states (not while CONNECTING).
  return state_ == ModuleState::Unhomed || state_ == ModuleState::Ready;
}

bool ModuleStateMachine::canMoveAbsolute() const {
  return state_ == ModuleState::Ready && positionValid_;
}

bool ModuleStateMachine::canStartTrack() const {
  return state_ == ModuleState::Ready && positionValid_;
}

bool ModuleStateMachine::canOta() const {
  return state_ == ModuleState::Unhomed || state_ == ModuleState::Ready ||
         state_ == ModuleState::Connecting || state_ == ModuleState::Fault;
}

bool ModuleStateMachine::isIdleForConfig() const {
  return state_ == ModuleState::Unhomed || state_ == ModuleState::Ready ||
         state_ == ModuleState::Connecting || state_ == ModuleState::Fault;
}

}  // namespace swarm
