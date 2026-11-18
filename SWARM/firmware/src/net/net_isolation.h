#pragma once

/**
 * 0.3.11: WebSocket I/O runs on a dedicated FreeRTOS task so blocking
 * WiFiClient::write / ws_.loop cannot starve MotionPlanner on the Arduino loop.
 *
 * When SWARM_NET_ISOLATED=1 (default for device builds ≥0.3.11):
 *   - shouldDeferWsIo(..., networkIsolated=true) → never defer
 *   - ProtocolClient::serviceLocal() runs on the motor loop
 *   - ProtocolClient::serviceNetwork() runs on the net task
 *
 * 0.3.10 baseline: cooperative defer (networkIsolated=false) remains available
 * for host-side policy regression and as the known working autonomy binary.
 */
#ifndef SWARM_NET_ISOLATED
#if defined(UNIT_TEST)
#define SWARM_NET_ISOLATED 0
#else
#define SWARM_NET_ISOLATED 1
#endif
#endif

namespace swarm {

inline constexpr bool networkIsolatedBuild() { return SWARM_NET_ISOLATED != 0; }

}  // namespace swarm
