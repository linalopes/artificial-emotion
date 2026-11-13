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

inline bool messageTooLarge(size_t nbytes, size_t maxBytes = SWARM_MAX_WS_MESSAGE_BYTES) {
  return nbytes > maxBytes;
}

}  // namespace rules
}  // namespace swarm
