#pragma once

#include <Arduino.h>

namespace swarm {

enum class FaultCode : uint16_t {
  None = 0,
  EndstopAmbiguous = 1,
  HomingTimeout = 2,
  HomingTravelExceeded = 3,
  HomingTransitionFailed = 4,
  HomingRecoveryDisabled = 5,
  HomingRecoveryFailed = 6,
  UnexpectedEndstopOpen = 7,
  SoftLimitViolation = 8,
  MotionRejected = 9,
  ConfigInvalid = 10,
  Unprovisioned = 11,
  OtaRejected = 12,
  OtaFailed = 13,
  ProtocolError = 14,
  TrackInfeasible = 15,
  DisconnectStop = 16,
};

inline const char* faultToString(FaultCode code) {
  switch (code) {
    case FaultCode::None:
      return "none";
    case FaultCode::EndstopAmbiguous:
      return "endstop_ambiguous";
    case FaultCode::HomingTimeout:
      return "homing_timeout";
    case FaultCode::HomingTravelExceeded:
      return "homing_travel_exceeded";
    case FaultCode::HomingTransitionFailed:
      return "homing_transition_failed";
    case FaultCode::HomingRecoveryDisabled:
      return "homing_recovery_disabled";
    case FaultCode::HomingRecoveryFailed:
      return "homing_recovery_failed";
    case FaultCode::UnexpectedEndstopOpen:
      return "unexpected_endstop_open";
    case FaultCode::SoftLimitViolation:
      return "soft_limit_violation";
    case FaultCode::MotionRejected:
      return "motion_rejected";
    case FaultCode::ConfigInvalid:
      return "config_invalid";
    case FaultCode::Unprovisioned:
      return "unprovisioned";
    case FaultCode::OtaRejected:
      return "ota_rejected";
    case FaultCode::OtaFailed:
      return "ota_failed";
    case FaultCode::ProtocolError:
      return "protocol_error";
    case FaultCode::TrackInfeasible:
      return "track_infeasible";
    case FaultCode::DisconnectStop:
      return "disconnect_stop";
    default:
      return "unknown";
  }
}

}  // namespace swarm
