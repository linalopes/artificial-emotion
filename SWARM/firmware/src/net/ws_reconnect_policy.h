#pragma once

#include <stdint.h>

#include <swarm_limits.h>

namespace swarm {

/**
 * Host-testable WebSocket reconnect gating (0.3.8).
 *
 * Autonomous playback must never share a blocking TCP connect with the stepper
 * loop. While an autonomous run is already executing and the link is down,
 * defer reconnect entirely — remote STOP is unavailable until the Mac returns
 * (physical cutoff remains the emergency path).
 */
inline bool shouldDeferWsReconnect(bool autonomyActive, bool linked) {
  return autonomyActive && !linked;
}

/** Whether to begin a new outbound connect attempt (paced). */
inline bool shouldAttemptWsReconnect(bool wifiConnected, bool provisioned, bool linked,
                                     bool autonomyActive, uint32_t nowMs, uint32_t lastAttemptMs,
                                     uint32_t minBackoffMs = SWARM_WS_RECONNECT_MIN_MS) {
  if (!wifiConnected || !provisioned || linked) {
    return false;
  }
  if (shouldDeferWsReconnect(autonomyActive, linked)) {
    return false;
  }
  if (lastAttemptMs != 0) {
    const uint32_t elapsed = static_cast<uint32_t>(nowMs - lastAttemptMs);
    if (elapsed < minBackoffMs) {
      return false;
    }
  }
  return true;
}

/**
 * Whether to call WebSocketsClient::loop().
 * Linked sessions always service (STOP / clock / status).
 * Unlinked + autonomous: never — avoids library connect() with TCP timeout.
 */
inline bool shouldServiceWsClient(bool socketStarted, bool linked, bool autonomyActive) {
  if (shouldDeferWsReconnect(autonomyActive, linked)) {
    return false;
  }
  if (linked) {
    return true;
  }
  return socketStarted;
}

/** TCP connect timeout must stay under stall abort (100 ms). */
inline constexpr uint32_t wsTcpTimeoutMs() {
  return SWARM_WS_TCP_TIMEOUT_MS < (SWARM_STALL_ABORT_US / 1000u)
             ? SWARM_WS_TCP_TIMEOUT_MS
             : (SWARM_STALL_ABORT_US / 1000u) / 2u;
}

}  // namespace swarm
