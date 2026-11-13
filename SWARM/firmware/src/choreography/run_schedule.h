#pragma once

#include <stdint.h>

#include <swarm_limits.h>

namespace swarm {

// Host-testable commit horizon checks (no Arduino).
inline bool validateCommitLead(uint64_t startCoordUs, uint64_t nowCoordUs, const char** reason) {
  if (startCoordUs <= nowCoordUs) {
    if (reason) {
      *reason = "start_timestamp_expired";
    }
    return false;
  }
  const uint64_t lead = startCoordUs - nowCoordUs;
  if (lead < SWARM_COMMIT_MIN_LEAD_US) {
    if (reason) {
      *reason = "start_lead_too_short";
    }
    return false;
  }
  if (lead > SWARM_COMMIT_MAX_LEAD_US) {
    if (reason) {
      *reason = "start_lead_too_long";
    }
    return false;
  }
  return true;
}

}  // namespace swarm
