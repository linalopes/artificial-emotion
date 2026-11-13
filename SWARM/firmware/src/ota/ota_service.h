#pragma once

#include <Arduino.h>
#include <HTTPClient.h>

#include "../config/config_store.h"
#include "../system/module_state.h"

namespace swarm {

enum class OtaPhase : uint8_t {
  Idle = 0,
  BeginHttp,
  ReadingHeader,
  Writing,
  Finalizing,
  Rebooting,
  Failed,
};

class OtaService {
 public:
  void begin(ConfigStore* config, ModuleStateMachine* state);
  bool startHttpUpdate(const char* url, const char* token, String* error);
  void service();
  bool active() const {
    return phase_ != OtaPhase::Idle && phase_ != OtaPhase::Failed;
  }
  OtaPhase phase() const { return phase_; }
  uint8_t progressPercent() const;

 private:
  ConfigStore* config_ = nullptr;
  ModuleStateMachine* state_ = nullptr;
  OtaPhase phase_ = OtaPhase::Idle;
  String url_;
  HTTPClient http_;
  WiFiClient* stream_ = nullptr;
  int contentLength_ = -1;
  int bytesWritten_ = 0;
  uint32_t phaseStartedMs_ = 0;
  uint32_t lastProgressMs_ = 0;
  bool magicChecked_ = false;
  uint8_t headerBuf_[4] = {};
  uint8_t headerLen_ = 0;

  static constexpr uint32_t kHttpTimeoutMs = 20000;
  static constexpr uint32_t kStallTimeoutMs = 30000;
  static constexpr size_t kChunkBytes = 1024;
  static constexpr uint8_t kEspImageMagic = 0xE9;

  void fail(const char* reason);
  void cleanupHttp();
  bool ensureIdleMotorGate(String* error) const;
};

}  // namespace swarm
