#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace swarm {

// Bounded duplicate message_id cache (host-testable).
// Cleared on each new coordinator WebSocket session so sessions do not collide.
class IdempotencyCache {
 public:
  static constexpr size_t kCapacity = 16;
  static constexpr size_t kIdMax = 48;
  static constexpr size_t kDetailMax = 80;

  void clear() {
    for (size_t i = 0; i < kCapacity; i++) {
      entries_[i].used = false;
      entries_[i].id[0] = '\0';
    }
    next_ = 0;
  }

  // Begin a new coordinator session (call on WS connect).
  void beginSession() {
    session_++;
    if (session_ == 0) {
      session_ = 1;
    }
    clear();
  }

  uint32_t session() const { return session_; }

  bool lookup(const char* messageId, bool* okOut, char* detailOut, size_t detailSize) const {
    if (!messageId || messageId[0] == '\0') {
      return false;
    }
    for (size_t i = 0; i < kCapacity; i++) {
      if (!entries_[i].used) {
        continue;
      }
      if (entries_[i].session != session_) {
        continue;
      }
      if (strncmp(entries_[i].id, messageId, kIdMax) == 0) {
        if (okOut) {
          *okOut = entries_[i].ok;
        }
        if (detailOut && detailSize > 0) {
          strncpy(detailOut, entries_[i].detail, detailSize - 1);
          detailOut[detailSize - 1] = '\0';
        }
        return true;
      }
    }
    return false;
  }

  void remember(const char* messageId, bool ok, const char* detail) {
    if (!messageId || messageId[0] == '\0') {
      return;
    }
    Entry& e = entries_[next_ % kCapacity];
    next_ = (next_ + 1) % kCapacity;
    e.used = true;
    e.session = session_;
    e.ok = ok;
    strncpy(e.id, messageId, kIdMax - 1);
    e.id[kIdMax - 1] = '\0';
    strncpy(e.detail, detail ? detail : "", kDetailMax - 1);
    e.detail[kDetailMax - 1] = '\0';
  }

 private:
  struct Entry {
    bool used = false;
    bool ok = false;
    uint32_t session = 0;
    char id[kIdMax] = {};
    char detail[kDetailMax] = {};
  };

  Entry entries_[kCapacity];
  size_t next_ = 0;
  uint32_t session_ = 1;
};

// Host-testable delay_ms validation. Returns nullptr if OK, else reason.
inline const char* validateStartAtDelayMs(long delayMs, uint32_t maxDelayMs) {
  if (delayMs < 0) {
    return "delay_ms negative";
  }
  if (static_cast<uint32_t>(delayMs) > maxDelayMs) {
    return "delay_ms exceeds max";
  }
  return nullptr;
}

}  // namespace swarm
