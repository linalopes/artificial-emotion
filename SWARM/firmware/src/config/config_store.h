#pragma once

#include <Arduino.h>

#include <swarm_limits.h>

namespace swarm {

enum class CoilHoldMode : uint8_t {
  Release = 0,
  Hold = 1,
};

enum class DisconnectPolicy : uint8_t {
  FinishSegmentThenStop = 0,
  ControlledStop = 1,
};

struct SwarmConfig {
  char moduleId[8] = "UNPROV";
  char wifiSsid[33] = "";
  char wifiPassword[65] = "";
  char coordinatorHost[64] = "192.168.1.10";
  uint16_t coordinatorPort = 8765;
  char authToken[33] = "swarm-local";

  float spoolDiameterMm = 15.0f;
  uint32_t stepsPerOutputRev = 4096;
  float calibrationFactor = 1.0f;

  int8_t retractDirection = -1;
  float maxTravelMm = 500.0f;
  float speedRpm = 15.0f;
  float accelerationMmS2 = 20.0f;

  float homeSeekRpm = 15.0f;
  float homeBackoffRpm = 6.0f;
  uint32_t homeSearchMaxSteps = 20000;
  uint32_t homeTimeoutMs = 60000;
  float homeOffsetMm = 2.0f;
  bool homeOpenRecoveryEnabled = false;
  uint32_t homeRecoveryMaxSteps = 2000;

  CoilHoldMode coilHoldMode = CoilHoldMode::Release;
  DisconnectPolicy disconnectPolicy = DisconnectPolicy::FinishSegmentThenStop;

  // Runtime ceilings — always clamped to compile-time absolute maxima on load/validate.
  float hardMaxRpm = 15.0f;
  float hardMaxAccelMmS2 = 200.0f;
  float hardMaxTravelMm = 1500.0f;

  uint32_t configRevision = 0;
};

class ConfigStore {
 public:
  bool begin();
  const SwarmConfig& get() const { return cfg_; }
  SwarmConfig& mutableCfg() { return cfg_; }

  bool isProvisioned() const;
  bool applyAndValidate(const SwarmConfig& incoming, String* error);
  bool save();
  void loadDefaults();

  // Clamp any config's hard ceilings to absolute maxima (mutates in place).
  static void clampHardCeilings(SwarmConfig& c);

  // Host-testable validation without NVS.
  static bool validateConfig(const SwarmConfig& c, String* error);

  float stepsPerMm() const;
  int32_t mmToSteps(float mm) const;
  float stepsToMm(int32_t steps) const;
  float rpmToStepsPerSec(float rpm) const;
  float mmS2ToStepsS2(float mmS2) const;

 private:
  SwarmConfig cfg_;
};

}  // namespace swarm
