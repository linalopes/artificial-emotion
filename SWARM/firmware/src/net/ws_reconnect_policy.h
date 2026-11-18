#pragma once

#include <stdint.h>

#include <swarm_limits.h>

namespace swarm {

/**
 * Host-testable WebSocket I/O gating (0.3.8 reconnect + 0.3.10 still-linked).
 *
 * Autonomous playback must never share blocking TCP with the stepper loop.
 *
 * 0.3.8 covered: unlinked + autonomous → defer reconnect / skip ws_.loop() so
 * library connect() cannot stall MotionPlanner.
 *
 * 0.3.10 covers: still-linked + autonomous → also skip ws_.loop() and outbound
 * sendTXT. ESP32 WiFiClient::write() can block up to
 * WIFI_CLIENT_MAX_WRITE_RETRY × WIFI_CLIENT_SELECT_TIMEOUT_US (10 × 1 s) when
 * the coordinator is abruptly unreachable while tcp->connected() remains true.
 * WebSockets::write()'s WEBSOCKETS_TCP_TIMEOUT millis fence does not bound a
 * single nested WiFiClient::write() call. That path triggers IncompleteStop
 * (100 ms) → applyRestPolicy() coil release with no FAULT while the run stays
 * logically active. Physical cutoff remains the emergency stop.
 */
inline bool shouldDeferWsIo(bool autonomyActive) { return autonomyActive; }

/** Legacy name: defer outbound reconnect attempts while autonomy + unlinked. */
inline bool shouldDeferWsReconnect(bool autonomyActive, bool linked) {
  return autonomyActive && !linked;
}

/** Whether outbound WS frames may be written (status / events / acks). */
inline bool shouldEmitWsTraffic(bool linked, bool autonomyActive) {
  return linked && !shouldDeferWsIo(autonomyActive);
}

/** Whether to begin a new outbound connect attempt (paced). */
inline bool shouldAttemptWsReconnect(bool wifiConnected, bool provisioned, bool linked,
                                     bool autonomyActive, uint32_t nowMs, uint32_t lastAttemptMs,
                                     uint32_t minBackoffMs = SWARM_WS_RECONNECT_MIN_MS) {
  if (!wifiConnected || !provisioned || linked) {
    return false;
  }
  if (shouldDeferWsReconnect(autonomyActive, linked) || shouldDeferWsIo(autonomyActive)) {
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
 * Autonomous runs: never — covers reconnect connect() and still-linked write/read.
 * Linked + not autonomous: yes (STOP / clock / status).
 * Unlinked + not autonomous: only if socket already started (reconnect path).
 */
inline bool shouldServiceWsClient(bool socketStarted, bool linked, bool autonomyActive) {
  if (shouldDeferWsIo(autonomyActive)) {
    return false;
  }
  if (linked) {
    return true;
  }
  return socketStarted;
}

/**
 * 0.3.8/0.3.9 production gating retained for regression contrast: linked sessions
 * always serviced ws_.loop() even during autonomy — the still-linked hole.
 */
inline bool shouldServiceWsClientV038(bool socketStarted, bool linked, bool autonomyActive) {
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

/**
 * Arduino-ESP32 WiFiClient::write() worst-case stall (framework constants).
 * Not bounded by WEBSOCKETS_TCP_TIMEOUT; select waits up to 1 s per retry.
 */
inline constexpr uint32_t esp32WifiClientWriteWorstCaseMs() {
  return SWARM_WIFI_CLIENT_MAX_WRITE_RETRY * (SWARM_WIFI_CLIENT_SELECT_TIMEOUT_US / 1000u);
}

/**
 * Cooperative-loop model of production ordering:
 *   planner × 2 → track → protocol(ws) → planner × 1
 * Injects an abruptly unreachable coordinator (blocking WS write) while the
 * planner is mid-move and linked_ is still true (no disconnect callback yet).
 */
struct AbruptUnreachableSimResult {
  uint32_t stepsAfterFault = 0;
  uint32_t incompleteStops = 0;
  uint32_t loopsWithCoilsDark = 0;
  bool runStillActive = true;
  bool faulted = false;
};

inline AbruptUnreachableSimResult simulateAbruptUnreachableCoordinator(
    bool useV038WsGating, uint32_t wsBlockMs, uint32_t loopsAfterFault = 40) {
  AbruptUnreachableSimResult r;
  const bool linked = true;
  const bool autonomy = true;
  bool moving = true;
  bool coilsHeld = true;
  uint32_t lastStepUs = 0;
  uint32_t nowUs = 1000;  // non-zero so first stall check is meaningful
  const uint32_t stepIntervalUs = 1000;

  auto tryStep = [&](uint32_t* stepCounter) {
    if (!moving || r.faulted) {
      return;
    }
    if (nowUs > lastStepUs && (nowUs - lastStepUs) > SWARM_STALL_ABORT_US) {
      r.incompleteStops++;
      moving = false;
      coilsHeld = false;  // finishIdle → applyRestPolicy (coil_hold=0)
      return;
    }
    if (nowUs >= lastStepUs + stepIntervalUs) {
      lastStepUs = nowUs;
      coilsHeld = true;
      if (stepCounter) {
        (*stepCounter)++;
      }
    }
  };

  // Warm-up under healthy link (negligible WS cost).
  for (int i = 0; i < 10; ++i) {
    nowUs += 500;
    tryStep(nullptr);
    nowUs += 500;
    tryStep(nullptr);
    nowUs += 200;
    tryStep(nullptr);
  }

  // Abrupt unreachable: half-open TCP, linked_ still true, no WStype_DISCONNECTED.
  for (uint32_t i = 0; i < loopsAfterFault; ++i) {
    nowUs += 500;
    tryStep(&r.stepsAfterFault);
    nowUs += 500;
    tryStep(&r.stepsAfterFault);

    // TrackPlayer resume of IncompleteStop (track.service before protocol).
    if (!moving && r.runStillActive && !r.faulted) {
      moving = true;
      lastStepUs = nowUs;
    }

    const bool serviceWs =
        useV038WsGating ? shouldServiceWsClientV038(true, linked, autonomy)
                        : shouldServiceWsClient(true, linked, autonomy);
    const bool emit =
        useV038WsGating ? linked : shouldEmitWsTraffic(linked, autonomy);
    if (serviceWs || emit) {
      // Nested WiFiClient::write blocks BEFORE linked_ becomes false.
      nowUs += wsBlockMs * 1000u;
    }

    nowUs += 200;
    tryStep(&r.stepsAfterFault);

    if (!coilsHeld) {
      r.loopsWithCoilsDark++;
    }
  }

  return r;
}

}  // namespace swarm
