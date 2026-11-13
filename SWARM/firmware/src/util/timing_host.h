#pragma once

#include <stdint.h>

namespace swarm {

// Rollover-safe elapsed helpers (same as timing.h, host-testable without Arduino).
inline uint32_t elapsedUint32(uint32_t now, uint32_t then) {
  return static_cast<uint32_t>(now - then);
}

inline bool deadlineReached(uint32_t now, uint32_t start, uint32_t duration) {
  return elapsedUint32(now, start) >= duration;
}

}  // namespace swarm
