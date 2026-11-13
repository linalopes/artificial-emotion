#pragma once

#include <Arduino.h>

namespace swarm {

// Mandatory COM+NC endstop on GPIO1 with INPUT_PULLUP.
// LOW  = NC closed (circuit OK at rest)
// HIGH = NC open OR disconnected wire — never treat static HIGH as home.
class Endstop {
 public:
  void begin();
  void service();

  bool rawClosed() const;       // instantaneous LOW
  bool debouncedClosed() const; // stable LOW
  bool risingEdge();            // closed->open (LOW->HIGH), sticky until consumed
  bool fallingEdge();           // open->closed (HIGH->LOW), sticky until consumed

 private:
  bool lastReading_ = HIGH;
  bool stable_ = HIGH;
  uint32_t changedAt_ = 0;
  bool risePending_ = false;
  bool fallPending_ = false;
  static constexpr uint32_t kDebounceMs = 20;
};

}  // namespace swarm
