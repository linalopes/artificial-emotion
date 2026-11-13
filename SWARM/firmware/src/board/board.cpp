#include "board.h"

#include "pins.h"
#include "../util/timing.h"

namespace swarm {
namespace {

bool lastButtonReading = HIGH;
bool buttonStable = HIGH;
uint32_t buttonChangedAt = 0;
constexpr uint32_t kDebounceMs = 30;

}  // namespace

void boardInit() {
  pinMode(pins::kUserButton, INPUT_PULLUP);
  pinMode(pins::kEndstop, INPUT_PULLUP);

  for (uint8_t i = 0; i < 4; i++) {
    digitalWrite(pins::kMotorPins[i], LOW);
    pinMode(pins::kMotorPins[i], OUTPUT);
  }
}

bool userButtonPressed() {
  const bool reading = digitalRead(pins::kUserButton);
  const uint32_t now = millis();

  if (reading != lastButtonReading) {
    buttonChangedAt = now;
    lastButtonReading = reading;
  }

  if (elapsedMs(now, buttonChangedAt) >= kDebounceMs && reading != buttonStable) {
    buttonStable = reading;
  }

  return buttonStable == LOW;
}

}  // namespace swarm
