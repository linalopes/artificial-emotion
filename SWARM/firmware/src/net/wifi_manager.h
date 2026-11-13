#pragma once

#include <Arduino.h>

#include "../config/config_store.h"

namespace swarm {

enum class WifiPhase : uint8_t {
  Idle = 0,
  Connecting,
  Connected,
  Backoff,
  NoCredentials,
};

class WifiManager {
 public:
  void begin(ConfigStore* config);
  void service();
  bool isConnected() const;
  WifiPhase phase() const { return phase_; }
  int8_t rssi() const;
  void requestReconnect();

 private:
  ConfigStore* config_ = nullptr;
  WifiPhase phase_ = WifiPhase::Idle;
  uint32_t connectStartedMs_ = 0;
  uint32_t backoffStartedMs_ = 0;
  uint32_t backoffMs_ = 1000;
  void startConnect();
};

}  // namespace swarm
