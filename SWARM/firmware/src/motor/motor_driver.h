#pragma once

#include <Arduino.h>

namespace swarm {

// Half-step ULN2003A driver ported from Controller v1 motion-test firmware.
// Direction: +1 / -1 advances the 8-phase sequence. Does not own timing.
class MotorDriver {
 public:
  void begin();
  void applyPhase();
  void step(int8_t direction);
  void release();  // all coils off
  void hold();     // energize current phase
  bool coilsEnergized() const { return energized_; }
  int8_t phaseIndex() const { return phaseIndex_; }

 private:
  int8_t phaseIndex_ = 0;
  bool energized_ = false;
};

}  // namespace swarm
