#pragma once

#include <Arduino.h>

// Artificial Emotion Controller v1 PCB — Swarm pin contract.
namespace swarm {
namespace pins {

constexpr uint8_t kMotorIn1 = 10;
constexpr uint8_t kMotorIn2 = 11;
constexpr uint8_t kMotorIn3 = 12;
constexpr uint8_t kMotorIn4 = 13;
constexpr uint8_t kMotorPins[4] = {kMotorIn1, kMotorIn2, kMotorIn3, kMotorIn4};

constexpr uint8_t kUserButton = 7;
constexpr uint8_t kEndstop = 1;  // Sensor A1 — mandatory COM+NC to GND

}  // namespace pins
}  // namespace swarm
