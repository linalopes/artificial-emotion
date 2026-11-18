#pragma once

#include <stdint.h>

#include <swarm_limits.h>

namespace swarm {

/**
 * WebSocket I/O gating.
 *
 * 0.3.8: unlinked + autonomous → defer reconnect (connect() on cooperative loop).
 * 0.3.10: still-linked + autonomous → also skip ws_.loop/sendTXT (WiFiClient write
 *         can block ~10 s and IncompleteStop the planner).
 * 0.3.11: when networkIsolated (FreeRTOS net task owns WS), do not defer — blocking
 *         I/O cannot starve MotionPlanner. Reconnect + telemetry + STOP resume.
 *
 * 0.3.10 remains the known working autonomy baseline when isolation is off.
 */
inline bool shouldDeferWsIo(bool autonomyActive, bool networkIsolated = false) {
  if (networkIsolated) {
    return false;
  }
  return autonomyActive;
}

/** 0.3.10 baseline: always defer WS I/O while autonomy is active. */
inline bool shouldDeferWsIoV0310(bool autonomyActive) { return autonomyActive; }

/** Legacy name: defer outbound reconnect while autonomy + unlinked (cooperative loop). */
inline bool shouldDeferWsReconnect(bool autonomyActive, bool linked, bool networkIsolated = false) {
  if (networkIsolated) {
    return false;
  }
  return autonomyActive && !linked;
}

inline bool shouldEmitWsTraffic(bool linked, bool autonomyActive, bool networkIsolated = false) {
  return linked && !shouldDeferWsIo(autonomyActive, networkIsolated);
}

inline bool shouldAttemptWsReconnect(bool wifiConnected, bool provisioned, bool linked,
                                     bool autonomyActive, uint32_t nowMs, uint32_t lastAttemptMs,
                                     uint32_t minBackoffMs = SWARM_WS_RECONNECT_MIN_MS,
                                     bool networkIsolated = false) {
  if (!wifiConnected || !provisioned || linked) {
    return false;
  }
  if (shouldDeferWsReconnect(autonomyActive, linked, networkIsolated)) {
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

inline bool shouldServiceWsClient(bool socketStarted, bool linked, bool autonomyActive,
                                  bool networkIsolated = false) {
  if (shouldDeferWsIo(autonomyActive, networkIsolated)) {
    return false;
  }
  if (linked) {
    return true;
  }
  return socketStarted;
}

/** 0.3.8/0.3.9: linked sessions always serviced — still-linked hole. */
inline bool shouldServiceWsClientV038(bool socketStarted, bool linked, bool autonomyActive) {
  if (autonomyActive && !linked) {
    return false;
  }
  if (linked) {
    return true;
  }
  return socketStarted;
}

/** 0.3.10 cooperative gating (no isolation). */
inline bool shouldServiceWsClientV0310(bool socketStarted, bool linked, bool autonomyActive) {
  return shouldServiceWsClient(socketStarted, linked, autonomyActive, false);
}

inline constexpr uint32_t wsTcpTimeoutMs() {
  return SWARM_WS_TCP_TIMEOUT_MS < (SWARM_STALL_ABORT_US / 1000u)
             ? SWARM_WS_TCP_TIMEOUT_MS
             : (SWARM_STALL_ABORT_US / 1000u) / 2u;
}

inline constexpr uint32_t esp32WifiClientWriteWorstCaseMs() {
  return SWARM_WIFI_CLIENT_MAX_WRITE_RETRY * (SWARM_WIFI_CLIENT_SELECT_TIMEOUT_US / 1000u);
}

struct AbruptUnreachableSimResult {
  uint32_t stepsAfterFault = 0;
  uint32_t incompleteStops = 0;
  uint32_t loopsWithCoilsDark = 0;
  bool runStillActive = true;
  bool faulted = false;
};

/**
 * Cooperative motor loop with optional network isolation.
 * useV038WsGating: legacy still-linked hole.
 * networkIsolated: 0.3.11 — WS block does not advance motor time.
 */
inline AbruptUnreachableSimResult simulateAbruptUnreachableCoordinator(
    bool useV038WsGating, uint32_t wsBlockMs, uint32_t loopsAfterFault = 40,
    bool networkIsolated = false) {
  AbruptUnreachableSimResult r;
  const bool linked = true;
  const bool autonomy = true;
  bool moving = true;
  bool coilsHeld = true;
  uint32_t lastStepUs = 0;
  uint32_t nowUs = 1000;
  const uint32_t stepIntervalUs = 1000;

  auto tryStep = [&](uint32_t* stepCounter) {
    if (!moving || r.faulted) {
      return;
    }
    if (nowUs > lastStepUs && (nowUs - lastStepUs) > SWARM_STALL_ABORT_US) {
      r.incompleteStops++;
      moving = false;
      coilsHeld = false;
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

  for (int i = 0; i < 10; ++i) {
    nowUs += 500;
    tryStep(nullptr);
    nowUs += 500;
    tryStep(nullptr);
    nowUs += 200;
    tryStep(nullptr);
  }

  for (uint32_t i = 0; i < loopsAfterFault; ++i) {
    nowUs += 500;
    tryStep(&r.stepsAfterFault);
    nowUs += 500;
    tryStep(&r.stepsAfterFault);

    if (!moving && r.runStillActive && !r.faulted) {
      moving = true;
      lastStepUs = nowUs;
    }

    const bool serviceWs =
        useV038WsGating
            ? shouldServiceWsClientV038(true, linked, autonomy)
            : shouldServiceWsClient(true, linked, autonomy, networkIsolated);
    const bool emit =
        useV038WsGating ? linked
                        : shouldEmitWsTraffic(linked, autonomy, networkIsolated);
    // Network block only starves the motor when WS shares the cooperative loop.
    if ((serviceWs || emit) && !networkIsolated) {
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

/** Host model: telemetry + STOP allowed during autonomy when isolated. */
inline bool autonomyAllowsTelemetry(bool networkIsolated) { return networkIsolated; }
inline bool autonomyAllowsRemoteStop(bool networkIsolated, bool linked) {
  return networkIsolated && linked;
}
inline bool autonomyContinuesWhileDisconnected(bool autonomyActive) { return autonomyActive; }

}  // namespace swarm
