#include "motor_driver.h"

#include "../board/pins.h"

namespace swarm {
namespace {

// Identical half-step sequence to Controller v1 firmware.
constexpr uint8_t kSequence[8] = {
    0b0001, 0b0011, 0b0010, 0b0110,
    0b0100, 0b1100, 0b1000, 0b1001};

}  // namespace

void MotorDriver::begin() {
  phaseIndex_ = 0;
  release();
}

void MotorDriver::applyPhase() {
  const uint8_t pattern = kSequence[static_cast<uint8_t>(phaseIndex_)];
  for (uint8_t i = 0; i < 4; i++) {
    digitalWrite(pins::kMotorPins[i], (pattern & (1 << i)) ? HIGH : LOW);
  }
  energized_ = true;
}

void MotorDriver::step(int8_t direction) {
  if (direction == 0) {
    return;
  }
  phaseIndex_ = static_cast<int8_t>(phaseIndex_ + (direction > 0 ? 1 : -1));
  if (phaseIndex_ > 7) {
    phaseIndex_ = 0;
  }
  if (phaseIndex_ < 0) {
    phaseIndex_ = 7;
  }
  applyPhase();
}

void MotorDriver::release() {
  for (uint8_t i = 0; i < 4; i++) {
    digitalWrite(pins::kMotorPins[i], LOW);
  }
  energized_ = false;
}

void MotorDriver::hold() {
  applyPhase();
}

}  // namespace swarm
