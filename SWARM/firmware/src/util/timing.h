#pragma once

#include <Arduino.h>

namespace swarm {

inline uint32_t elapsedUs(uint32_t now, uint32_t then) {
  return static_cast<uint32_t>(now - then);
}

inline uint32_t elapsedMs(uint32_t now, uint32_t then) {
  return static_cast<uint32_t>(now - then);
}

}  // namespace swarm
