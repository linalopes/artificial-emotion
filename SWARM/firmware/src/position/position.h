#pragma once

#include <Arduino.h>

#include "../config/config_store.h"

namespace swarm {

// Estimated position from commanded half-steps after successful homing.
// z_mm = 0 usable zero; positive descends (line extends).
class PositionModel {
 public:
  void begin();
  void invalidate();
  void setZero();
  void setSteps(int32_t steps);
  void addSteps(int32_t delta);

  bool valid() const { return valid_; }
  int32_t steps() const { return steps_; }
  float zMm(const ConfigStore& cfg) const;

  int32_t softMinSteps() const { return 0; }
  int32_t softMaxSteps(const ConfigStore& cfg) const;

 private:
  bool valid_ = false;
  int32_t steps_ = 0;
};

}  // namespace swarm
