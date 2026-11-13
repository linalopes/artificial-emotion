#pragma once

#include <stdint.h>
#include <string.h>

#include <swarm_limits.h>

#include "../sync/clock_sync.h"
#include "run_schedule.h"
#include "track_player.h"

namespace swarm {

enum class RunPhase : uint8_t {
  Idle = 0,
  Loaded,
  Prepared,
  Armed,
  Running,
  Completed,
  Failed,
  Cancelled,
};

// Collective prepare/commit/arm on top of TrackPlayer.
// Host-testable core: scheduling validation without Arduino.
class RunController {
 public:
  void begin(TrackPlayer* track, ClockSync* clock) {
    track_ = track;
    clock_ = clock;
    reset();
  }

  void reset() {
    phase_ = RunPhase::Idle;
    runId_[0] = '\0';
    startCoordUs_ = 0;
    startLocalUs_ = 0;
    actualStartLocalUs_ = 0;
    startErrorUs_ = 0;
    reject_[0] = '\0';
  }

  RunPhase phase() const { return phase_; }
  const char* runId() const { return runId_; }
  int64_t startErrorUs() const { return startErrorUs_; }
  uint64_t startLocalUs() const { return startLocalUs_; }
  const char* lastReject() const { return reject_; }

  bool loadRun(const char* runId, const char* presetId, uint32_t revision,
               const TrackKeyframe* frames, size_t count, String* error) {
    if (!runId || runId[0] == '\0' || strlen(runId) >= SWARM_RUN_ID_MAX) {
      if (error) {
        *error = "invalid run_id";
      }
      return false;
    }
    if (phase_ == RunPhase::Armed || phase_ == RunPhase::Running || phase_ == RunPhase::Prepared) {
      if (error) {
        *error = "cannot load while prepared/armed/running";
      }
      return false;
    }
    if (!track_->load(presetId, revision, frames, count, error)) {
      return false;
    }
    strncpy(runId_, runId, SWARM_RUN_ID_MAX - 1);
    runId_[SWARM_RUN_ID_MAX - 1] = '\0';
    phase_ = RunPhase::Loaded;
    reject_[0] = '\0';
    return true;
  }

  // Also accept track already loaded via load_preset — bind run_id only.
  bool bindLoadedTrack(const char* runId, String* error) {
    if (!track_->hasTrack()) {
      if (error) {
        *error = "no track loaded";
      }
      return false;
    }
    if (!runId || runId[0] == '\0' || strlen(runId) >= SWARM_RUN_ID_MAX) {
      if (error) {
        *error = "invalid run_id";
      }
      return false;
    }
    strncpy(runId_, runId, SWARM_RUN_ID_MAX - 1);
    runId_[SWARM_RUN_ID_MAX - 1] = '\0';
    phase_ = RunPhase::Loaded;
    return true;
  }

  bool prepare(const char* runId, bool positionValid, bool readyState, bool faulted, bool otaActive,
               bool plannerBusy, bool homeActive, String* error) {
    if (!runId || strcmp(runId, runId_) != 0) {
      setReject("run_id mismatch");
      if (error) {
        *error = reject_;
      }
      return false;
    }
    if (phase_ != RunPhase::Loaded && phase_ != RunPhase::Prepared) {
      setReject("not loaded");
      if (error) {
        *error = reject_;
      }
      return false;
    }
    if (faulted || otaActive || plannerBusy || homeActive) {
      setReject("busy_or_fault_or_ota");
      if (error) {
        *error = reject_;
      }
      return false;
    }
    if (!positionValid || !readyState) {
      setReject("not_ready_or_unhomed");
      if (error) {
        *error = reject_;
      }
      return false;
    }
    if (!clock_ || !clock_->isSynced()) {
      setReject("clock_not_synced");
      if (error) {
        *error = reject_;
      }
      return false;
    }
    String terr;
    if (!track_->prepareStart(&terr)) {
      setReject(terr.c_str());
      if (error) {
        *error = terr;
      }
      return false;
    }
    phase_ = RunPhase::Prepared;
    reject_[0] = '\0';
    return true;
  }

  bool commit(const char* runId, uint64_t startCoordinatorUs, uint64_t localNowUs, String* error) {
    if (!runId || strcmp(runId, runId_) != 0) {
      setReject("run_id mismatch");
      if (error) {
        *error = reject_;
      }
      return false;
    }
    if (phase_ != RunPhase::Prepared) {
      setReject("not_prepared");
      if (error) {
        *error = reject_;
      }
      return false;
    }
    if (!clock_ || !clock_->isSynced()) {
      setReject("clock_not_synced");
      if (error) {
        *error = reject_;
      }
      phase_ = RunPhase::Failed;
      return false;
    }

    const uint64_t nowCoord = clock_->localToCoordinator(localNowUs);
    const char* reason = nullptr;
    if (!swarm::validateCommitLead(startCoordinatorUs, nowCoord, &reason)) {
      setReject(reason);
      if (error) {
        *error = reject_;
      }
      // Do not start late.
      phase_ = RunPhase::Failed;
      return false;
    }

    startCoordUs_ = startCoordinatorUs;
    startLocalUs_ = clock_->coordinatorToLocal(startCoordinatorUs);
    String terr;
    // Arm track with local millis domain (ms resolution from us).
    const uint32_t startMs = static_cast<uint32_t>(startLocalUs_ / 1000ull);
    if (!track_->startAt(startMs, &terr)) {
      setReject(terr.c_str());
      if (error) {
        *error = terr;
      }
      phase_ = RunPhase::Failed;
      return false;
    }
    phase_ = RunPhase::Armed;
    reject_[0] = '\0';
    return true;
  }

  void cancel(const char* runId) {
    if (runId && runId[0] != '\0' && runId_[0] != '\0' && strcmp(runId, runId_) != 0) {
      return;
    }
    if (phase_ == RunPhase::Running) {
      track_->stop();
    } else if (phase_ == RunPhase::Armed || phase_ == RunPhase::Prepared) {
      track_->stop();
    }
    phase_ = RunPhase::Cancelled;
  }

  void onDisconnectBeforeStart() {
    if (phase_ == RunPhase::Prepared || phase_ == RunPhase::Armed || phase_ == RunPhase::Loaded) {
      track_->stop();
      phase_ = RunPhase::Cancelled;
      setReject("coordinator_disconnect_before_start");
    }
  }

  // Call every loop with local micros; returns true once when run actually starts.
  bool service(uint64_t localNowUs, bool syncStillOk) {
    if (phase_ == RunPhase::Armed) {
      if (!syncStillOk) {
        track_->stop();
        phase_ = RunPhase::Failed;
        setReject("sync_lost_before_start");
        return false;
      }
      // Pre-start safety: if local time already past start by more than uncertainty, reject.
      if (localNowUs + 1000ull < startLocalUs_) {
        // still waiting — track player uses millis; keep phase Armed
        return false;
      }
      // Detect start when track leaves Armed/Playing prelude.
      if (track_->phase() == TrackPhase::Playing || track_->phase() == TrackPhase::SegmentActive) {
        actualStartLocalUs_ = localNowUs;
        startErrorUs_ = static_cast<int64_t>(actualStartLocalUs_) - static_cast<int64_t>(startLocalUs_);
        phase_ = RunPhase::Running;
        return true;
      }
      // If track failed to start and went Stopped without running:
      if (track_->phase() == TrackPhase::Stopped && localNowUs > startLocalUs_ + 500000ull) {
        phase_ = RunPhase::Failed;
        setReject("start_missed");
      }
      return false;
    }

    if (phase_ == RunPhase::Running) {
      if (track_->phase() == TrackPhase::Completed) {
        phase_ = RunPhase::Completed;
      } else if (track_->phase() == TrackPhase::Stopped) {
        phase_ = RunPhase::Cancelled;
      }
    }
    return false;
  }

  void markFault() {
    if (phase_ == RunPhase::Running || phase_ == RunPhase::Armed || phase_ == RunPhase::Prepared) {
      track_->stop();
      phase_ = RunPhase::Failed;
      setReject("node_fault");
    }
  }

 private:
  void setReject(const char* r) {
    strncpy(reject_, r ? r : "", sizeof(reject_) - 1);
    reject_[sizeof(reject_) - 1] = '\0';
  }

  TrackPlayer* track_ = nullptr;
  ClockSync* clock_ = nullptr;
  RunPhase phase_ = RunPhase::Idle;
  char runId_[SWARM_RUN_ID_MAX] = {};
  uint64_t startCoordUs_ = 0;
  uint64_t startLocalUs_ = 0;
  uint64_t actualStartLocalUs_ = 0;
  int64_t startErrorUs_ = 0;
  char reject_[48] = {};
};

inline const char* runPhaseToString(RunPhase p) {
  switch (p) {
    case RunPhase::Idle:
      return "IDLE";
    case RunPhase::Loaded:
      return "LOADED";
    case RunPhase::Prepared:
      return "PREPARED";
    case RunPhase::Armed:
      return "ARMED";
    case RunPhase::Running:
      return "RUNNING";
    case RunPhase::Completed:
      return "COMPLETED";
    case RunPhase::Failed:
      return "FAILED";
    case RunPhase::Cancelled:
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}

}  // namespace swarm
