#include "home_controller.h"

#include "../util/log.h"
#include "../util/timing.h"

namespace swarm {

void HomeController::begin(MotionPlanner* planner, Endstop* endstop, PositionModel* position,
                           ConfigStore* config, ModuleStateMachine* state) {
  planner_ = planner;
  endstop_ = endstop;
  position_ = position;
  config_ = config;
  state_ = state;
  phase_ = HomePhase::Idle;
}

bool HomeController::start(String* error) {
  if (active()) {
    if (error) {
      *error = "homing already active";
    }
    return false;
  }
  if (!state_->canHome()) {
    if (error) {
      *error = "state rejects home";
    }
    return false;
  }
  if (planner_->isBusy()) {
    if (error) {
      *error = "planner busy";
    }
    return false;
  }

  position_->invalidate();
  state_->invalidatePosition();
  state_->setHoming();
  startedAtMs_ = millis();
  lastFault_ = FaultCode::None;

  endstop_->risingEdge();
  endstop_->fallingEdge();

  if (endstop_->debouncedClosed()) {
    SWARM_LOG("Homing start: endstop CLOSED — seek open");
    startSeekOpen();
    return true;
  }

  // Already open (HIGH): ambiguous. Optional bounded recovery only if enabled.
  if (!config_->get().homeOpenRecoveryEnabled) {
    if (error) {
      *error = "endstop open at start; recovery disabled";
    }
    enterFault(FaultCode::HomingRecoveryDisabled);
    return false;
  }

  SWARM_LOG("Homing start: endstop OPEN — bounded recovery probe");
  String err;
  const int8_t releaseMotorDir = static_cast<int8_t>(-config_->get().retractDirection);
  phase_ = HomePhase::RecoveryProbe;
  phaseStepsBudget_ = config_->get().homeRecoveryMaxSteps;
  if (!planner_->startRawMove(releaseMotorDir, phaseStepsBudget_, config_->get().homeSeekRpm,
                              &err)) {
    if (error) {
      *error = err;
    }
    enterFault(FaultCode::HomingRecoveryFailed);
    return false;
  }
  return true;
}

void HomeController::startSeekOpen() {
  String err;
  // If already open when entering seek, do not retract further.
  if (!endstop_->rawClosed()) {
    SWARM_LOG("Homing: already open at seek entry — confirm only");
    planner_->haltRawImmediate();
    phase_ = HomePhase::SeekOpenConfirm;
    confirmStartedMs_ = millis();
    endstop_->risingEdge();  // consume; wait for debounced open
    return;
  }

  phase_ = HomePhase::SeekOpen;
  phaseStepsBudget_ = config_->get().homeSearchMaxSteps;
  if (!planner_->startRawMove(config_->get().retractDirection, phaseStepsBudget_,
                              config_->get().homeSeekRpm, &err)) {
    enterFault(FaultCode::MotionRejected);
  }
}

void HomeController::startBackoff() {
  String err;
  phase_ = HomePhase::BackoffClose;
  phaseStepsBudget_ = config_->get().homeRecoveryMaxSteps;
  if (phaseStepsBudget_ < 500) {
    phaseStepsBudget_ = 500;
  }
  const int8_t releaseMotorDir = static_cast<int8_t>(-config_->get().retractDirection);
  if (!planner_->startRawMove(releaseMotorDir, phaseStepsBudget_, config_->get().homeBackoffRpm,
                              &err)) {
    enterFault(FaultCode::MotionRejected);
  }
}

void HomeController::startOffset() {
  String err;
  phase_ = HomePhase::ApplyOffset;
  const int32_t offsetSteps = abs(config_->mmToSteps(config_->get().homeOffsetMm));
  phaseStepsBudget_ = static_cast<uint32_t>(offsetSteps > 0 ? offsetSteps : 1);
  const int8_t releaseMotorDir = static_cast<int8_t>(-config_->get().retractDirection);
  if (!planner_->startRawMove(releaseMotorDir, phaseStepsBudget_, config_->get().homeBackoffRpm,
                              &err)) {
    enterFault(FaultCode::MotionRejected);
  }
}

bool HomeController::timedOut() const {
  return elapsedMs(millis(), startedAtMs_) > config_->get().homeTimeoutMs;
}

void HomeController::enterFault(FaultCode code) {
  planner_->emergencyReleaseStop();
  phase_ = HomePhase::Failed;
  lastFault_ = code;
  position_->invalidate();
  state_->enterFault(code);
  SWARM_LOG("Homing fault: %s", faultToString(code));
}

void HomeController::abort(FaultCode code) { enterFault(code); }

void HomeController::abortToUnhomed() {
  // M3: intentional stop — immediate halt, invalid position, UNHOMED, no FAULT.
  planner_->emergencyReleaseStop();
  phase_ = HomePhase::Idle;
  lastFault_ = FaultCode::None;
  position_->invalidate();
  state_->invalidatePosition();
  state_->setUnhomed();
  SWARM_LOG("Homing aborted to UNHOMED (operator stop)");
}

void HomeController::service() {
  if (!active()) {
    return;
  }
  if (timedOut()) {
    enterFault(FaultCode::HomingTimeout);
    return;
  }

  if (planner_->lastStall() == StallOutcome::PositionInvalid) {
    planner_->clearStall();
    enterFault(FaultCode::HomingTimeout);
    return;
  }

  switch (phase_) {
    case HomePhase::RecoveryProbe: {
      if (endstop_->fallingEdge() || endstop_->debouncedClosed()) {
        planner_->haltRawImmediate();
        endstop_->risingEdge();
        endstop_->fallingEdge();
        SWARM_LOG("Recovery: contact closed — continue seek open");
        startSeekOpen();
        break;
      }
      if (!planner_->isBusy()) {
        enterFault(FaultCode::HomingRecoveryFailed);
      }
      break;
    }
    case HomePhase::SeekOpen: {
      // C2: stop retract immediately on raw NC open — do not wait for debounce.
      if (!endstop_->rawClosed()) {
        planner_->haltRawImmediate();
        phase_ = HomePhase::SeekOpenConfirm;
        confirmStartedMs_ = millis();
        SWARM_LOG("Homing: raw OPEN — retract halted; confirming debounce");
        break;
      }
      if (!planner_->isBusy()) {
        enterFault(FaultCode::HomingTravelExceeded);
      }
      break;
    }
    case HomePhase::SeekOpenConfirm: {
      // Require debounced open (stable HIGH). Ambiguous disconnect looks the same electrically;
      // subsequent backoff must re-close to prove a mechanical switch rather than a broken wire.
      if (!endstop_->debouncedClosed()) {
        // Debounced open confirmed (stable HIGH).
        endstop_->risingEdge();
        endstop_->fallingEdge();
        SWARM_LOG("Homing: debounced OPEN confirmed");
        startBackoff();
        break;
      }
      // Still reading closed after raw open — chatter; allow short confirm window.
      if (elapsedMs(millis(), confirmStartedMs_) > 500) {
        enterFault(FaultCode::HomingTransitionFailed);
      }
      break;
    }
    case HomePhase::BackoffClose: {
      // Must observe a close transition to distinguish switch release from a disconnected cable.
      if (endstop_->fallingEdge() || endstop_->debouncedClosed()) {
        planner_->haltRawImmediate();
        SWARM_LOG("Homing: HIGH->LOW release confirmed (mechanical contact)");
        if (config_->get().homeOffsetMm > 0.0f) {
          startOffset();
        } else {
          position_->setZero();
          state_->markPositionValid();
          state_->setReady();
          phase_ = HomePhase::Complete;
          SWARM_LOG("Homing complete at switch release (offset 0)");
        }
        break;
      }
      if (!planner_->isBusy()) {
        // Ran budget without re-closing → likely disconnect, not a switch.
        enterFault(FaultCode::EndstopAmbiguous);
      }
      break;
    }
    case HomePhase::ApplyOffset: {
      if (!planner_->isBusy()) {
        if (!endstop_->debouncedClosed()) {
          enterFault(FaultCode::HomingTransitionFailed);
          break;
        }
        position_->setZero();
        state_->markPositionValid();
        state_->setReady();
        phase_ = HomePhase::Complete;
        SWARM_LOG("Homing complete with offset %.2f mm", config_->get().homeOffsetMm);
      }
      break;
    }
    default:
      break;
  }
}

}  // namespace swarm
