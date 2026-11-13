#include "ota_service.h"

#include <Update.h>
#include <WiFi.h>
#include <esp_task_wdt.h>

#include "../system/faults.h"
#include "../util/log.h"
#include "../util/timing.h"

namespace swarm {

void OtaService::begin(ConfigStore* config, ModuleStateMachine* state) {
  config_ = config;
  state_ = state;
  phase_ = OtaPhase::Idle;
}

bool OtaService::ensureIdleMotorGate(String* error) const {
  if (!state_->canOta()) {
    if (error) {
      *error = "state rejects ota (motor must be idle, not homing/moving)";
    }
    return false;
  }
  return true;
}

bool OtaService::startHttpUpdate(const char* url, const char* token, String* error) {
  if (active()) {
    if (error) {
      *error = "ota already active";
    }
    return false;
  }
  if (!ensureIdleMotorGate(error)) {
    return false;
  }
  if (WiFi.status() != WL_CONNECTED) {
    if (error) {
      *error = "wifi not connected";
    }
    return false;
  }
  if (!token || token[0] == '\0' || strcmp(token, config_->get().authToken) != 0) {
    if (error) {
      *error = "auth token rejected";
    }
    state_->enterFault(FaultCode::OtaRejected);
    return false;
  }
  if (!url || strlen(url) < 8 || strncmp(url, "http://", 7) != 0) {
    // v1: local HTTP only. Do not silently accept unverified schemes.
    if (error) {
      *error = "url must be http:// on local network";
    }
    return false;
  }

  url_ = url;
  contentLength_ = -1;
  bytesWritten_ = 0;
  magicChecked_ = false;
  headerLen_ = 0;
  stream_ = nullptr;
  phaseStartedMs_ = millis();
  lastProgressMs_ = millis();
  phase_ = OtaPhase::BeginHttp;
  state_->setUpdating();
  SWARM_LOG("OTA queued: %s", url_.c_str());
  return true;
}

void OtaService::cleanupHttp() {
  stream_ = nullptr;
  if (http_.connected()) {
    http_.end();
  }
}

void OtaService::fail(const char* reason) {
  SWARM_LOG("OTA failed: %s", reason ? reason : "?");
  if (Update.isRunning()) {
    Update.abort();
  }
  cleanupHttp();
  phase_ = OtaPhase::Failed;
  state_->enterFault(FaultCode::OtaFailed);
}

uint8_t OtaService::progressPercent() const {
  if (contentLength_ <= 0 || bytesWritten_ < 0) {
    return 0;
  }
  const int p = (bytesWritten_ * 100) / contentLength_;
  return static_cast<uint8_t>(p > 100 ? 100 : p);
}

void OtaService::service() {
  if (phase_ == OtaPhase::Idle || phase_ == OtaPhase::Failed) {
    return;
  }

  // Feed WDT during long transfers; motor is idle by gate.
  // Note: if the task is not registered with the TWDT, this is a no-op / ignored.
  esp_task_wdt_reset();

  if (phase_ != OtaPhase::Rebooting &&
      elapsedMs(millis(), lastProgressMs_) > kStallTimeoutMs) {
    fail("transfer stall timeout");
    return;
  }

  switch (phase_) {
    case OtaPhase::BeginHttp: {
      http_.setTimeout(kHttpTimeoutMs);
      http_.setReuse(false);
      if (!http_.begin(url_)) {
        fail("http begin failed");
        return;
      }
      const int code = http_.GET();
      if (code != HTTP_CODE_OK) {
        fail("http get failed");
        return;
      }
      contentLength_ = http_.getSize();
      if (contentLength_ <= 256) {
        fail("content length missing or too small");
        return;
      }
      // Reject images larger than typical dual-OTA app slot (~1.75 MB on 4 MB table).
      if (contentLength_ > static_cast<int>(0x1C0000)) {
        fail("image larger than OTA app partition");
        return;
      }
      stream_ = http_.getStreamPtr();
      if (!stream_) {
        fail("no stream");
        return;
      }
      phase_ = OtaPhase::ReadingHeader;
      phaseStartedMs_ = millis();
      lastProgressMs_ = millis();
      break;
    }
    case OtaPhase::ReadingHeader: {
      while (stream_->available() && headerLen_ < 4) {
        headerBuf_[headerLen_++] = static_cast<uint8_t>(stream_->read());
        lastProgressMs_ = millis();
      }
      if (headerLen_ < 4) {
        if (elapsedMs(millis(), phaseStartedMs_) > kHttpTimeoutMs) {
          fail("header timeout");
        }
        return;
      }
      if (headerBuf_[0] != kEspImageMagic) {
        fail("invalid firmware magic (not ESP image)");
        return;
      }
      magicChecked_ = true;
      if (!Update.begin(contentLength_)) {
        fail(Update.errorString());
        return;
      }
      // Write the 4 header bytes already consumed.
      if (Update.write(headerBuf_, 4) != 4) {
        fail("header write failed");
        return;
      }
      bytesWritten_ = 4;
      phase_ = OtaPhase::Writing;
      lastProgressMs_ = millis();
      break;
    }
    case OtaPhase::Writing: {
      uint8_t buf[kChunkBytes];
      size_t budget = kChunkBytes;  // one chunk per service() — keeps loop responsive for WDT/status
      while (budget > 0 && stream_->available() && bytesWritten_ < contentLength_) {
        const size_t want =
            min(budget, static_cast<size_t>(contentLength_ - bytesWritten_));
        const int n = stream_->readBytes(reinterpret_cast<char*>(buf), want);
        if (n <= 0) {
          break;
        }
        if (Update.write(buf, static_cast<size_t>(n)) != static_cast<size_t>(n)) {
          fail("flash write failed");
          return;
        }
        bytesWritten_ += n;
        budget -= static_cast<size_t>(n);
        lastProgressMs_ = millis();
      }

      if (bytesWritten_ >= contentLength_) {
        phase_ = OtaPhase::Finalizing;
        break;
      }

      // Connection closed early?
      if (!stream_->connected() && !stream_->available() && bytesWritten_ < contentLength_) {
        fail("connection closed before complete");
      }
      break;
    }
    case OtaPhase::Finalizing: {
      // Update.end() verifies the ESP app image checksum embedded in the binary.
      // A client-supplied checksum is NOT used as authentication (token + LAN only).
      if (!Update.end(true) || !Update.isFinished()) {
        fail(Update.errorString());
        return;
      }
      cleanupHttp();
      SWARM_LOG("OTA success (%d bytes, %u%%) — rebooting UNHOMED", bytesWritten_,
                progressPercent());
      phase_ = OtaPhase::Rebooting;
      phaseStartedMs_ = millis();
      break;
    }
    case OtaPhase::Rebooting: {
      if (elapsedMs(millis(), phaseStartedMs_) < 200) {
        return;
      }
      ESP.restart();
      break;
    }
    default:
      break;
  }
}

}  // namespace swarm
