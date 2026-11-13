#pragma once

#include <Arduino.h>

#ifndef SWARM_LOG_ENABLE
#define SWARM_LOG_ENABLE 1
#endif

#if SWARM_LOG_ENABLE
#define SWARM_LOG(fmt, ...) Serial.printf("[SWARM] " fmt "\n", ##__VA_ARGS__)
#else
#define SWARM_LOG(fmt, ...)
#endif
