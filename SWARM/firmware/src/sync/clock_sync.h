#pragma once

#include <stdint.h>
#include <string.h>

#include <swarm_limits.h>

namespace swarm {

// Four-timestamp sync with Mac as clock authority.
// offset_us ≈ local_us - coordinator_us  ⇒  local = coordinator + offset
// Host-testable: inject now via processFin/sample APIs; no Arduino dependency.
class ClockSync {
 public:
  void begin() {
    invalidate();
    uncertaintyMaxUs_ = SWARM_CLOCK_DEFAULT_UNCERTAINTY_MAX_US;
  }

  void beginSession() {
    // New coordinator WebSocket session — prior offset is untrusted.
    invalidate();
    pendingSeq_ = 0;
    pendingValid_ = false;
  }

  void invalidate() {
    synced_ = false;
    count_ = 0;
    next_ = 0;
    offsetUs_ = 0;
    rttUs_ = 0;
    uncertaintyUs_ = UINT64_MAX;
    lastSyncLocalUs_ = 0;
  }

  void setUncertaintyMaxUs(uint32_t us) {
    if (us < SWARM_CLOCK_ABS_MIN_UNCERTAINTY_MAX_US) {
      us = SWARM_CLOCK_ABS_MIN_UNCERTAINTY_MAX_US;
    }
    if (us > SWARM_CLOCK_ABS_MAX_UNCERTAINTY_MAX_US) {
      us = SWARM_CLOCK_ABS_MAX_UNCERTAINTY_MAX_US;
    }
    uncertaintyMaxUs_ = us;
    recompute(lastSyncLocalUs_ == 0 ? 0 : lastSyncLocalUs_);
  }

  uint32_t uncertaintyMaxUs() const { return uncertaintyMaxUs_; }

  // Node received clock_sync_req(t1, seq) at local t2; reply with t2,t3.
  void onSyncReq(uint64_t t1CoordUs, uint32_t seq, uint64_t localNowUs, uint64_t* t2Out,
                 uint64_t* t3Out) {
    pendingT1_ = t1CoordUs;
    pendingSeq_ = seq;
    pendingT2_ = localNowUs;
    pendingValid_ = true;
    if (t2Out) {
      *t2Out = pendingT2_;
    }
    // t3 ≈ immediately after t2 for response composition.
    pendingT3_ = localNowUs;
    if (t3Out) {
      *t3Out = pendingT3_;
    }
  }

  // Apply Mac's clock_sync_fin with t4. Returns false if rejected.
  bool onSyncFin(uint64_t t1, uint64_t t2, uint64_t t3, uint64_t t4, uint32_t seq,
                 uint64_t localNowUs, const char** rejectReason) {
    if (!pendingValid_ || seq != pendingSeq_) {
      if (rejectReason) {
        *rejectReason = "sync_seq mismatch or no pending req";
      }
      return false;
    }
    if (t1 != pendingT1_ || t2 != pendingT2_) {
      if (rejectReason) {
        *rejectReason = "timestamp mismatch";
      }
      return false;
    }
    // Prefer t3 from fin if Mac echoes ours; allow small rewrite.
    if (t3 == 0) {
      t3 = pendingT3_;
    }
    if (t4 <= t1) {
      if (rejectReason) {
        *rejectReason = "invalid t4/t1 ordering";
      }
      return false;
    }

    const int64_t rtt = static_cast<int64_t>((t4 - t1) - (t3 - t2));
    if (rtt < 0 || static_cast<uint64_t>(rtt) > SWARM_CLOCK_MAX_RTT_US) {
      if (rejectReason) {
        *rejectReason = "rtt out of range";
      }
      return false;
    }

    // offset = ((t2 - t1) + (t3 - t4)) / 2   (local - coordinator)
    const int64_t o1 = static_cast<int64_t>(t2) - static_cast<int64_t>(t1);
    const int64_t o2 = static_cast<int64_t>(t3) - static_cast<int64_t>(t4);
    const int64_t offset = (o1 + o2) / 2;
    const uint64_t uncertainty = static_cast<uint64_t>(rtt) / 2;

    Sample s;
    s.offsetUs = offset;
    s.rttUs = static_cast<uint64_t>(rtt);
    s.uncertaintyUs = uncertainty;
    s.localUs = localNowUs;
    s.valid = true;

    samples_[next_ % SWARM_CLOCK_SAMPLE_CAPACITY] = s;
    next_++;
    if (count_ < SWARM_CLOCK_SAMPLE_CAPACITY) {
      count_++;
    }
    pendingValid_ = false;
    lastSyncLocalUs_ = localNowUs;
    recompute(localNowUs);
    return true;
  }

  // Direct sample injection for host tests (same math as onSyncFin path).
  bool addSample(int64_t offsetUs, uint64_t rttUs, uint64_t localNowUs, const char** rejectReason) {
    if (rttUs > SWARM_CLOCK_MAX_RTT_US) {
      if (rejectReason) {
        *rejectReason = "rtt out of range";
      }
      return false;
    }
    Sample s;
    s.offsetUs = offsetUs;
    s.rttUs = rttUs;
    s.uncertaintyUs = rttUs / 2;
    s.localUs = localNowUs;
    s.valid = true;
    samples_[next_ % SWARM_CLOCK_SAMPLE_CAPACITY] = s;
    next_++;
    if (count_ < SWARM_CLOCK_SAMPLE_CAPACITY) {
      count_++;
    }
    lastSyncLocalUs_ = localNowUs;
    recompute(localNowUs);
    return true;
  }

  void service(uint64_t localNowUs) {
    if (lastSyncLocalUs_ == 0) {
      synced_ = false;
      return;
    }
    const uint64_t ageUs = localNowUs - lastSyncLocalUs_;
    if (ageUs > static_cast<uint64_t>(SWARM_CLOCK_STALE_MS) * 1000ull) {
      synced_ = false;
      uncertaintyUs_ = UINT64_MAX;
    } else {
      recompute(localNowUs);
    }
  }

  bool isSynced() const { return synced_; }
  int64_t offsetUs() const { return offsetUs_; }
  uint64_t rttUs() const { return rttUs_; }
  uint64_t uncertaintyUs() const { return uncertaintyUs_; }

  uint32_t lastSyncAgeMs(uint64_t localNowUs) const {
    if (lastSyncLocalUs_ == 0 || localNowUs < lastSyncLocalUs_) {
      return UINT32_MAX;
    }
    return static_cast<uint32_t>((localNowUs - lastSyncLocalUs_) / 1000ull);
  }

  uint64_t coordinatorToLocal(uint64_t coordinatorUs) const {
    return static_cast<uint64_t>(static_cast<int64_t>(coordinatorUs) + offsetUs_);
  }

  uint64_t localToCoordinator(uint64_t localUs) const {
    return static_cast<uint64_t>(static_cast<int64_t>(localUs) - offsetUs_);
  }

  size_t sampleCount() const { return count_; }

 private:
  struct Sample {
    bool valid = false;
    int64_t offsetUs = 0;
    uint64_t rttUs = 0;
    uint64_t uncertaintyUs = 0;
    uint64_t localUs = 0;
  };

  void recompute(uint64_t /*localNowUs*/) {
    if (count_ == 0) {
      synced_ = false;
      uncertaintyUs_ = UINT64_MAX;
      return;
    }
    // Prefer lowest-RTT samples for offset (up to 3).
    Sample best[3];
    size_t bestN = 0;
    for (size_t i = 0; i < count_; i++) {
      const Sample& s = samples_[i];
      if (!s.valid) {
        continue;
      }
      size_t insert = bestN;
      while (insert > 0 && s.rttUs < best[insert - 1].rttUs) {
        if (insert < 3) {
          best[insert] = best[insert - 1];
        }
        insert--;
      }
      if (insert < 3) {
        best[insert] = s;
        if (bestN < 3) {
          bestN++;
        }
      }
    }
    if (bestN == 0) {
      synced_ = false;
      return;
    }
    int64_t sumOff = 0;
    uint64_t maxUnc = 0;
    uint64_t maxRtt = 0;
    for (size_t i = 0; i < bestN; i++) {
      sumOff += best[i].offsetUs;
      if (best[i].uncertaintyUs > maxUnc) {
        maxUnc = best[i].uncertaintyUs;
      }
      if (best[i].rttUs > maxRtt) {
        maxRtt = best[i].rttUs;
      }
    }
    offsetUs_ = sumOff / static_cast<int64_t>(bestN);
    rttUs_ = maxRtt;
    uncertaintyUs_ = maxUnc;
    synced_ = (uncertaintyUs_ <= uncertaintyMaxUs_);
  }

  Sample samples_[SWARM_CLOCK_SAMPLE_CAPACITY];
  size_t count_ = 0;
  size_t next_ = 0;
  bool synced_ = false;
  int64_t offsetUs_ = 0;
  uint64_t rttUs_ = 0;
  uint64_t uncertaintyUs_ = UINT64_MAX;
  uint64_t lastSyncLocalUs_ = 0;
  uint32_t uncertaintyMaxUs_ = SWARM_CLOCK_DEFAULT_UNCERTAINTY_MAX_US;

  bool pendingValid_ = false;
  uint32_t pendingSeq_ = 0;
  uint64_t pendingT1_ = 0;
  uint64_t pendingT2_ = 0;
  uint64_t pendingT3_ = 0;
};

}  // namespace swarm
