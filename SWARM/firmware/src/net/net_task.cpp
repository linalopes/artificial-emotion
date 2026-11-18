#include "net_task.h"

#include "net_isolation.h"

#if SWARM_NET_ISOLATED && !defined(UNIT_TEST)
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

#include "../util/log.h"
#endif

namespace swarm {

#if SWARM_NET_ISOLATED && !defined(UNIT_TEST)

namespace {

ProtocolClient* gNetProtocol = nullptr;
TaskHandle_t gNetTask = nullptr;

void networkTaskFn(void* /*arg*/) {
  SWARM_LOG("Net task started (core %d) — WS isolated from motor loop", xPortGetCoreID());
  for (;;) {
    if (gNetProtocol) {
      gNetProtocol->serviceNetwork();
    }
    // Yield frequently so WiFi stack + Arduino loop keep CPU; never busy-spin.
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

}  // namespace

void startNetworkTask(ProtocolClient* protocol) {
  gNetProtocol = protocol;
  if (gNetTask) {
    return;
  }
  // Pin to core 0 (protocol/WiFi affinity on ESP32-S3 Arduino). Motor loop stays on core 1.
  const BaseType_t ok =
      xTaskCreatePinnedToCore(networkTaskFn, "swarm_net", 8192, nullptr, 1, &gNetTask, 0);
  if (ok != pdPASS) {
    SWARM_LOG("FATAL: net task create failed — falling back to cooperative WS");
    gNetTask = nullptr;
    gNetProtocol = nullptr;
  }
}

#else

void startNetworkTask(ProtocolClient* /*protocol*/) {}

#endif

}  // namespace swarm
