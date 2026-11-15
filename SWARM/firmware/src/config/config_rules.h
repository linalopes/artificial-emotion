#pragma once

#include <stdint.h>
#include <string.h>

#include <swarm_limits.h>

namespace swarm {
namespace rules {

inline bool isValidModuleId(const char* id) {
  if (!id) {
    return false;
  }
  if (strcmp(id, "UNPROV") == 0) {
    return true;
  }
  if (strlen(id) != 5) {
    return false;
  }
  if (id[0] != 'M' || id[1] != 'a' || id[2] != 'u') {
    return false;
  }
  if (id[3] < '0' || id[3] > '9' || id[4] < '0' || id[4] > '9') {
    return false;
  }
  const int n = (id[3] - '0') * 10 + (id[4] - '0');
  return n >= 1 && n <= 9;
}

struct HardCeilings {
  float hardMaxRpm;
  float hardMaxAccelMmS2;
  float hardMaxTravelMm;
};

inline void clampHardCeilings(HardCeilings& c) {
  if (c.hardMaxRpm > SWARM_ABS_MAX_RPM || c.hardMaxRpm <= 0.0f) {
    c.hardMaxRpm = SWARM_ABS_MAX_RPM;
  }
  if (c.hardMaxAccelMmS2 > SWARM_ABS_MAX_ACCEL_MM_S2 || c.hardMaxAccelMmS2 <= 0.0f) {
    c.hardMaxAccelMmS2 = SWARM_ABS_MAX_ACCEL_MM_S2;
  }
  if (c.hardMaxTravelMm > SWARM_ABS_MAX_TRAVEL_MM || c.hardMaxTravelMm <= 0.0f) {
    c.hardMaxTravelMm = SWARM_ABS_MAX_TRAVEL_MM;
  }
}

// Returns nullptr if OK, else static reason string.
inline const char* checkHardCeilingsLegal(float hardMaxRpm, float hardMaxAccel,
                                          float hardMaxTravel) {
  if (hardMaxRpm <= 0.0f || hardMaxRpm > SWARM_ABS_MAX_RPM) {
    return "hard_max_rpm exceeds absolute maximum";
  }
  if (hardMaxAccel <= 0.0f || hardMaxAccel > SWARM_ABS_MAX_ACCEL_MM_S2) {
    return "hard_max_accel exceeds absolute maximum";
  }
  if (hardMaxTravel <= 0.0f || hardMaxTravel > SWARM_ABS_MAX_TRAVEL_MM) {
    return "hard_max_travel exceeds absolute maximum";
  }
  return nullptr;
}

/** Homing RPM uses SWARM_ABS_MAX_HOME_RPM — not the normal motion hardMaxRpm ceiling. */
inline const char* checkHomeRpmLegal(float homeSeekRpm, float homeBackoffRpm) {
  if (homeSeekRpm <= 0.0f || homeSeekRpm > SWARM_ABS_MAX_HOME_RPM) {
    return "home_seek_rpm out of range";
  }
  if (homeBackoffRpm <= 0.0f || homeBackoffRpm > SWARM_ABS_MAX_HOME_RPM) {
    return "home_backoff_rpm out of range";
  }
  return nullptr;
}

/**
 * NVS migration for firmware 0.3.4: raise the legacy 6 RPM motion hard ceiling (and
 * choreography speed) to SWARM_ABS_MAX_RPM. Homing fields are not modified.
 * Returns true when hardMaxRpm/speedRpm were updated and should be persisted.
 * migrationLevel is NVS key mot_ceil (0 = not yet migrated).
 */
inline bool applyMotionCeilingMigrationV034(float* hardMaxRpm, float* speedRpm,
                                            uint8_t migrationLevel) {
  if (!hardMaxRpm || !speedRpm) {
    return false;
  }
  if (migrationLevel >= 1) {
    return false;
  }
  *hardMaxRpm = SWARM_ABS_MAX_RPM;
  *speedRpm = SWARM_ABS_MAX_RPM;
  return true;
}

inline bool messageTooLarge(size_t nbytes, size_t maxBytes = SWARM_MAX_WS_MESSAGE_BYTES) {
  return nbytes > maxBytes;
}

}  // namespace rules
}  // namespace swarm
