#include "wifi_manager.h"

#include <WiFi.h>

#include "../util/log.h"
#include "../util/timing.h"

namespace swarm {

void WifiManager::begin(ConfigStore* config) {
  config_ = config;
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  if (strlen(config_->get().wifiSsid) == 0) {
    phase_ = WifiPhase::NoCredentials;
    SWARM_LOG("Wi-Fi: no SSID configured (Serial: set_wifi)");
    return;
  }
  startConnect();
}

void WifiManager::startConnect() {
  phase_ = WifiPhase::Connecting;
  SWARM_LOG("Wi-Fi: connecting to %s", config_->get().wifiSsid);
  WiFi.begin(config_->get().wifiSsid, config_->get().wifiPassword);
  connectStartedMs_ = millis();
}

void WifiManager::requestReconnect() {
  if (phase_ == WifiPhase::NoCredentials && strlen(config_->get().wifiSsid) == 0) {
    return;
  }
  WiFi.disconnect(false);
  backoffMs_ = 1000;
  startConnect();
}

bool WifiManager::isConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

int8_t WifiManager::rssi() const {
  if (!isConnected()) {
    return 0;
  }
  return static_cast<int8_t>(WiFi.RSSI());
}

void WifiManager::service() {
  if (phase_ == WifiPhase::NoCredentials) {
    if (strlen(config_->get().wifiSsid) > 0) {
      startConnect();
    }
    return;
  }

  if (isConnected()) {
    if (phase_ != WifiPhase::Connected) {
      SWARM_LOG("Wi-Fi: connected ip=%s rssi=%d", WiFi.localIP().toString().c_str(),
                WiFi.RSSI());
      backoffMs_ = 1000;
    }
    phase_ = WifiPhase::Connected;
    return;
  }

  const uint32_t now = millis();
  if (phase_ == WifiPhase::Connecting) {
    if (elapsedMs(now, connectStartedMs_) >= 15000) {
      SWARM_LOG("Wi-Fi: connect timeout — backoff %lu ms",
                static_cast<unsigned long>(backoffMs_));
      WiFi.disconnect(false);
      phase_ = WifiPhase::Backoff;
      backoffStartedMs_ = now;
      backoffMs_ = min(backoffMs_ * 2, static_cast<uint32_t>(60000));
    }
    return;
  }

  if (phase_ == WifiPhase::Connected) {
    SWARM_LOG("Wi-Fi: lost connection");
    phase_ = WifiPhase::Backoff;
    backoffStartedMs_ = now;
    return;
  }

  if (phase_ == WifiPhase::Backoff) {
    if (elapsedMs(now, backoffStartedMs_) >= backoffMs_) {
      startConnect();
    }
  }
}

}  // namespace swarm
