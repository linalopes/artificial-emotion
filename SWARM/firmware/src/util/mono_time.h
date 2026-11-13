#pragma once

#include <stdint.h>

#ifdef UNIT_TEST
// Host tests inject time via ClockSync APIs directly; this stub is unused there.
inline uint64_t monoTimeUs() { return 0; }
#elif defined(ARDUINO)
#include <esp_timer.h>
inline uint64_t monoTimeUs() { return static_cast<uint64_t>(esp_timer_get_time()); }
#else
inline uint64_t monoTimeUs() { return 0; }
#endif
