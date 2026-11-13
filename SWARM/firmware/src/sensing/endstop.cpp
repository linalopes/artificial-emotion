#include "endstop.h"

#include "../board/pins.h"
#include "../util/timing.h"

namespace swarm {

void Endstop::begin() {
  pinMode(pins::kEndstop, INPUT_PULLUP);
  lastReading_ = digitalRead(pins::kEndstop);
  stable_ = lastReading_;
  changedAt_ = millis();
  risePending_ = false;
  fallPending_ = false;
}

void Endstop::service() {
  const bool reading = digitalRead(pins::kEndstop);
  const uint32_t now = millis();

  if (reading != lastReading_) {
    changedAt_ = now;
    lastReading_ = reading;
  }

  if (elapsedMs(now, changedAt_) >= kDebounceMs && reading != stable_) {
    const bool wasClosed = (stable_ == LOW);
    stable_ = reading;
    const bool nowClosed = (stable_ == LOW);
    if (wasClosed && !nowClosed) {
      risePending_ = true;  // closed -> open
    } else if (!wasClosed && nowClosed) {
      fallPending_ = true;  // open -> closed
    }
  }
}

bool Endstop::rawClosed() const { return digitalRead(pins::kEndstop) == LOW; }

bool Endstop::debouncedClosed() const { return stable_ == LOW; }

bool Endstop::risingEdge() {
  if (!risePending_) {
    return false;
  }
  risePending_ = false;
  return true;
}

bool Endstop::fallingEdge() {
  if (!fallPending_) {
    return false;
  }
  fallPending_ = false;
  return true;
}

}  // namespace swarm
