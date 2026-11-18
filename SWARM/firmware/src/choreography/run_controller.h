#pragma once

#include <stdint.h>
#include <string.h>

#include <swarm_limits.h>

#include "../sync/clock_sync.h"
#include "autonomous_policy.h"
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
// Host-testable core: scheduling validation without Arduino (policy helpers).
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
    clearAutonomousPolicy(&policy_);
  }

  RunPhase phase() const { return phase_; }
  const char* runId() const { return runId_; }
  int64_t startErrorUs() const { return startErrorUs_; }
  uint64_t startLocalUs() const { return startLocalUs_; }
  const char* lastReject() const { return reject_; }
  const AutonomousPolicy& policy() const { return policy_; }
  bool autonomous() const { return policy_.autonomous; }

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
    clearAutonomousPolicy(&policy_);
    phase_ = RunPhase::Loaded;
    reject_[0] = '\0';
    return true;
  }

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

  bool prepare(const char* runId, const AutonomousPolicy& policy, bool positionValid, bool readyState,
               bool faulted, bool otaActive, bool plannerBusy, bool homeActive, String* error) {
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
    AutonomousPolicy normalized = policy;
    normalizeAutonomousPolicy(&normalized);
    const char* reason = nullptr;
    if (!validateAutonomousPolicy(normalized, &reason)) {
      setReject(reason ? reason : "invalid autonomous policy");
      if (error) {
        *error = reject_;
      }
      return false;
    }
    if (normalized.autonomous && normalized.loop && !track_->loopCompatible()) {
      setReject("track_not_loop_compatible");
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
    policy_ = normalized;
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
      clearAutonomousPolicy(&policy_);
      return false;
    }

    const uint64_t nowCoord = clock_->localToCoordinator(localNowUs);
    const char* reason = nullptr;
    if (!swarm::validateCommitLead(startCoordinatorUs, nowCoord, &reason)) {
      setReject(reason);
      if (error) {
        *error = reject_;
      }
      phase_ = RunPhase::Failed;
      clearAutonomousPolicy(&policy_);
      return false;
    }

    startCoordUs_ = startCoordinatorUs;
    startLocalUs_ = clock_->coordinatorToLocal(startCoordinatorUs);
    String terr;
    const uint32_t startMs = static_cast<uint32_t>(startLocalUs_ / 1000ull);
    if (!track_->startAt(startMs, policy_, &terr)) {
      setReject(terr.c_str());
      if (error) {
        *error = terr;
      }
      phase_ = RunPhase::Failed;
      clearAutonomousPolicy(&policy_);
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
    if (phase_ == RunPhase::Running || phase_ == RunPhase::Armed || phase_ == RunPhase::Prepared) {
      track_->stop();
    }
    phase_ = RunPhase::Cancelled;
    clearAutonomousPolicy(&policy_);
  }

  void onDisconnectBeforeStart() {
    if (phase_ == RunPhase::Prepared || phase_ == RunPhase::Armed || phase_ == RunPhase::Loaded) {
      track_->stop();
      phase_ = RunPhase::Cancelled;
      clearAutonomousPolicy(&policy_);
      setReject("coordinator_disconnect_before_start");
    }
    // Running + autonomous: do not cancel here; TrackPlayer continues.
  }

  /** True if disconnect must not tear down this run (autonomous and already running). */
  bool shouldSurviveDisconnect() const {
    return phase_ == RunPhase::Running && policy_.autonomous;
  }

  // Call every loop with local micros; returns true once when run actually starts.
  bool service(uint64_t localNowUs, bool syncStillOk) {
    if (phase_ == RunPhase::Armed) {
      if (!syncStillOk) {
        track_->stop();
        phase_ = RunPhase::Failed;
        clearAutonomousPolicy(&policy_);
        setReject("sync_lost_before_start");
        return false;
      }
      if (localNowUs + 1000ull < startLocalUs_) {
        return false;
      }
      if (track_->phase() == TrackPhase::Playing || track_->phase() == TrackPhase::SegmentActive) {
        if (track_->started()) {
          actualStartLocalUs_ = localNowUs;
          startErrorUs_ = static_cast<int64_t>(actualStartLocalUs_) - static_cast<int64_t>(startLocalUs_);
          phase_ = RunPhase::Running;
          return true;
        }
      }
      if (track_->phase() == TrackPhase::Stopped && localNowUs > startLocalUs_ + 500000ull) {
        phase_ = RunPhase::Failed;
        clearAutonomousPolicy(&policy_);
        setReject("start_missed");
      }
      return false;
    }

    if (phase_ == RunPhase::Running) {
      if (track_->phase() == TrackPhase::Completed) {
        phase_ = RunPhase::Completed;
        clearAutonomousPolicy(&policy_);
      } else if (track_->phase() == TrackPhase::Stopped) {
        phase_ = RunPhase::Cancelled;
        clearAutonomousPolicy(&policy_);
      }
      // Playing / SegmentActive / next loop: stay Running.
    }
    return false;
  }

  void markFault() {
    if (phase_ == RunPhase::Running || phase_ == RunPhase::Armed || phase_ == RunPhase::Prepared) {
      track_->stop();
      phase_ = RunPhase::Failed;
      clearAutonomousPolicy(&policy_);
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
  AutonomousPolicy policy_{};
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
