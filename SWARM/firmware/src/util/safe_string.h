#pragma once

#include <stddef.h>
#include <string.h>

namespace swarm {

// Always NUL-terminates dst (dstSize must be >= 1).
inline void copyToFixed(char* dst, size_t dstSize, const char* src) {
  if (dstSize == 0) {
    return;
  }
  if (!src) {
    dst[0] = '\0';
    return;
  }
  strncpy(dst, src, dstSize - 1);
  dst[dstSize - 1] = '\0';
}

}  // namespace swarm
