#include "position.h"

namespace swarm {

void PositionModel::begin() {
  valid_ = false;
  steps_ = 0;
}

void PositionModel::invalidate() {
  valid_ = false;
}

void PositionModel::setZero() {
  steps_ = 0;
  valid_ = true;
}

void PositionModel::setSteps(int32_t steps) { steps_ = steps; }

void PositionModel::addSteps(int32_t delta) { steps_ += delta; }

float PositionModel::zMm(const ConfigStore& cfg) const {
  if (!valid_) {
    return NAN;
  }
  return cfg.stepsToMm(steps_);
}

int32_t PositionModel::softMaxSteps(const ConfigStore& cfg) const {
  return cfg.mmToSteps(cfg.get().maxTravelMm);
}

}  // namespace swarm
