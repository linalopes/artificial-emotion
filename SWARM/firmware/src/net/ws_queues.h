#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include <swarm_limits.h>

#include "net_isolation.h"

#if !defined(UNIT_TEST) && SWARM_NET_ISOLATED
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#endif

namespace swarm {

#ifndef SWARM_WS_INBOUND_DEPTH
#define SWARM_WS_INBOUND_DEPTH 8u
#endif
#ifndef SWARM_WS_OUTBOUND_DEPTH
#define SWARM_WS_OUTBOUND_DEPTH 8u
#endif

enum class WsInboundKind : uint8_t {
  Text = 0,
  Connected = 1,
  Disconnected = 2,
};

struct WsInboundMsg {
  WsInboundKind kind = WsInboundKind::Text;
  uint16_t length = 0;
  char data[SWARM_MAX_WS_MESSAGE_BYTES];
};

struct WsOutboundMsg {
  uint16_t length = 0;
  char data[SWARM_JSON_DOC_CAPACITY];
};

/**
 * Bounded FreeRTOS queues between the motor loop and the network task.
 * On UNIT_TEST / non-isolated builds these become no-ops (direct path unused).
 */
class WsBridge {
 public:
  bool begin() {
#if !defined(UNIT_TEST) && SWARM_NET_ISOLATED
    if (!inbound_) {
      inbound_ = xQueueCreate(SWARM_WS_INBOUND_DEPTH, sizeof(WsInboundMsg));
    }
    if (!outbound_) {
      outbound_ = xQueueCreate(SWARM_WS_OUTBOUND_DEPTH, sizeof(WsOutboundMsg));
    }
    return inbound_ != nullptr && outbound_ != nullptr;
#else
    return true;
#endif
  }

  bool pushInbound(const WsInboundMsg& msg) {
#if !defined(UNIT_TEST) && SWARM_NET_ISOLATED
    if (!inbound_) {
      return false;
    }
    return xQueueSend(inbound_, &msg, 0) == pdTRUE;
#else
    (void)msg;
    return false;
#endif
  }

  bool popInbound(WsInboundMsg* out) {
#if !defined(UNIT_TEST) && SWARM_NET_ISOLATED
    if (!inbound_ || !out) {
      return false;
    }
    return xQueueReceive(inbound_, out, 0) == pdTRUE;
#else
    (void)out;
    return false;
#endif
  }

  bool pushOutbound(const char* data, size_t len) {
#if !defined(UNIT_TEST) && SWARM_NET_ISOLATED
    if (!outbound_ || !data || len == 0 || len >= sizeof(WsOutboundMsg::data)) {
      return false;
    }
    WsOutboundMsg msg{};
    msg.length = static_cast<uint16_t>(len);
    memcpy(msg.data, data, len);
    msg.data[len] = '\0';
    return xQueueSend(outbound_, &msg, 0) == pdTRUE;
#else
    (void)data;
    (void)len;
    return false;
#endif
  }

  bool popOutbound(WsOutboundMsg* out) {
#if !defined(UNIT_TEST) && SWARM_NET_ISOLATED
    if (!outbound_ || !out) {
      return false;
    }
    return xQueueReceive(outbound_, out, 0) == pdTRUE;
#else
    (void)out;
    return false;
#endif
  }

  /** Non-blocking peek for STOP so motor loop can prioritize. */
  bool tryMarkStopHint(const char* data, size_t len) {
    if (!data || len < 10) {
      return false;
    }
    // Cheap substring check — full parse still happens on the motor loop.
    auto contains = [](const char* hay, size_t n, const char* needle) -> bool {
      const size_t m = strlen(needle);
      if (m == 0 || m > n) {
        return false;
      }
      for (size_t i = 0; i + m <= n; ++i) {
        if (memcmp(hay + i, needle, m) == 0) {
          return true;
        }
      }
      return false;
    };
    if (contains(data, len, "\"stop\"") || contains(data, len, "\"stop_all\"")) {
      stopHint_ = true;
      return true;
    }
    return false;
  }

  bool consumeStopHint() {
    if (!stopHint_) {
      return false;
    }
    stopHint_ = false;
    return true;
  }

 private:
#if !defined(UNIT_TEST) && SWARM_NET_ISOLATED
  QueueHandle_t inbound_ = nullptr;
  QueueHandle_t outbound_ = nullptr;
#endif
  volatile bool stopHint_ = false;
};

}  // namespace swarm
