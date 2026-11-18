#pragma once

#include "protocol.h"

namespace swarm {

/** Start FreeRTOS network task (no-op when SWARM_NET_ISOLATED=0). */
void startNetworkTask(ProtocolClient* protocol);

}  // namespace swarm
