#include "track_player.h"

#include <math.h>

#include "../util/log.h"

namespace swarm {

void TrackPlayer::begin(MotionPlanner* planner, PositionModel* position, ConfigStore* config,
                        ModuleStateMachine* state) {
  planner_ = planner;
  position_ = position;
  config_ = config;
  state_ = state;
  phase_ = TrackPhase::Idle;
  count_ = 0;
}

bool TrackPlayer::validateFeasibility(String* error) const {
  if (count_ < 2) {
    if (error) {
      *error = "need at least 2 keyframes";
    }
    return false;
  }
  for (size_t i = 0; i < count_; i++) {
    if (frames_[i].zMm < 0.0f || frames_[i].zMm > config_->get().maxTravelMm) {
      if (error) {
        *error = "keyframe outside max_travel_mm";
      }
      return false;
    }
    if (i > 0 && frames_[i].timeMs <= frames_[i - 1].timeMs) {
      if (error) {
        *error = "keyframe times must increase";
      }
      return false;
    }
  }

  const float maxMmS =
      (config_->get().speedRpm * static_cast<float>(M_PI) * config_->get().spoolDiameterMm) / 60.0f;
  for (size_t i = 1; i < count_; i++) {
    const float dz = fabsf(frames_[i].zMm - frames_[i - 1].zMm);
    const float dt = (frames_[i].timeMs - frames_[i - 1].timeMs) / 1000.0f;
    if (dt <= 0.0f) {
      continue;
    }
    if (dz / dt > maxMmS * 1.25f) {
      if (error) {
        *error = "segment exceeds configured speed capability";
      }
      return false;
    }
  }
  return true;
}

bool TrackPlayer::load(const char* presetId, uint32_t revision, const TrackKeyframe* frames,
                       size_t count, String* error) {
  if (phase_ == TrackPhase::Playing || phase_ == TrackPhase::SegmentActive ||
      phase_ == TrackPhase::Armed) {
    if (error) {
      *error = "cannot load while track armed/playing";
    }
    return false;
  }
  if (count > kMaxTrackKeyframes) {
    if (error) {
      *error = "too many keyframes";
    }
    return false;
  }
  for (size_t i = 0; i < count; i++) {
    frames_[i] = frames[i];
  }
  count_ = count;
  revision_ = revision;
  strncpy(presetId_, presetId ? presetId : "", sizeof(presetId_) - 1);
  presetId_[sizeof(presetId_) - 1] = '\0';
  if (!validateFeasibility(error)) {
    count_ = 0;
    return false;
  }
  phase_ = TrackPhase::Loaded;
  index_ = 0;
  SWARM_LOG("Track loaded preset=%s rev=%lu frames=%u", presetId_,
            static_cast<unsigned long>(revision_), static_cast<unsigned>(count_));
  return true;
}

bool TrackPlayer::prepareStart(String* error) {
  if (!hasTrack()) {
    if (error) {
      *error = "no track loaded";
    }
    return false;
  }
  if (!state_->canStartTrack()) {
    if (error) {
      *error = "state rejects prepare_start";
    }
    return false;
  }
  if (!validateFeasibility(error)) {
    return false;
  }
  phase_ = TrackPhase::Armed;
  return true;
}

bool TrackPlayer::startAt(uint32_t startAtMillisLocal, String* error) {
  if (phase_ != TrackPhase::Armed) {
    if (error) {
      *error = "not armed";
    }
    return false;
  }
  startAtMs_ = startAtMillisLocal;
  phase_ = TrackPhase::Playing;
  index_ = 0;
  disconnectPendingStop_ = false;
  SWARM_LOG("Track start_at local_ms=%lu (now=%lu)", static_cast<unsigned long>(startAtMillisLocal),
            static_cast<unsigned long>(millis()));
  return true;
}

void TrackPlayer::stop() {
  planner_->requestControlledStop();
  phase_ = TrackPhase::Stopped;
  if (state_->state() == ModuleState::Moving) {
    state_->setStopping();
  }
}

void TrackPlayer::onCoordinatorDisconnected(bool finishCurrentSegment) {
  if (phase_ != TrackPhase::Playing && phase_ != TrackPhase::SegmentActive &&
      phase_ != TrackPhase::Armed) {
    return;
  }
  if (phase_ == TrackPhase::Armed || phase_ == TrackPhase::Playing) {
    phase_ = TrackPhase::Loaded;
    return;
  }
  if (finishCurrentSegment && phase_ == TrackPhase::SegmentActive) {
    disconnectPendingStop_ = true;
    SWARM_LOG("Disconnect: finishing current segment then stop");
    return;
  }
  stop();
  SWARM_LOG("Disconnect: controlled stop");
}

bool TrackPlayer::beginSegment(size_t fromIndex, String* error) {
  if (fromIndex + 1 >= count_) {
    return false;
  }
  const float target = frames_[fromIndex + 1].zMm;
  const int32_t targetSteps = config_->mmToSteps(target);
  if (!planner_->moveToSteps(targetSteps, config_->get().speedRpm, config_->get().accelerationMmS2,
                             error)) {
    return false;
  }
  index_ = fromIndex;
  phase_ = TrackPhase::SegmentActive;
  state_->setMoving();
  return true;
}

void TrackPlayer::service() {
  if (phase_ == TrackPhase::Playing) {
    if (static_cast<int32_t>(millis() - startAtMs_) < 0) {
      return;
    }
    String err;
    // Move toward first keyframe as segment 0 prelude using frames[0] as target from current.
    const int32_t first = config_->mmToSteps(frames_[0].zMm);
    if (position_->steps() != first) {
      if (!planner_->moveToSteps(first, config_->get().speedRpm, config_->get().accelerationMmS2,
                                 &err)) {
        phase_ = TrackPhase::Stopped;
        state_->enterFault(FaultCode::TrackInfeasible);
        return;
      }
      state_->setMoving();
      // Treat as "segment" completing into index 0 ready for beginSegment(0).
      phase_ = TrackPhase::SegmentActive;
      index_ = static_cast<size_t>(-2);  // sentinel: prelude to first keyframe
      return;
    }
    if (!beginSegment(0, &err)) {
      phase_ = TrackPhase::Stopped;
      state_->enterFault(FaultCode::TrackInfeasible);
    }
    return;
  }

  if (phase_ != TrackPhase::SegmentActive) {
    return;
  }

  if (planner_->status() == PlannerStatus::Faulted) {
    phase_ = TrackPhase::Stopped;
    return;
  }

  if (planner_->isBusy()) {
    return;
  }

  if (state_->state() == ModuleState::Moving || state_->state() == ModuleState::Stopping) {
    state_->setReady();
  }

  if (disconnectPendingStop_) {
    phase_ = TrackPhase::Stopped;
    disconnectPendingStop_ = false;
    SWARM_LOG("Disconnect policy: segment done, not starting next");
    return;
  }

  // Prelude finished: start first timed segment.
  if (index_ == static_cast<size_t>(-2)) {
    String err;
    if (!beginSegment(0, &err)) {
      phase_ = TrackPhase::Stopped;
      state_->enterFault(FaultCode::TrackInfeasible);
    }
    return;
  }

  const size_t nextFrom = index_ + 1;
  if (nextFrom + 1 >= count_) {
    phase_ = TrackPhase::Completed;
    SWARM_LOG("Track completed");
    return;
  }

  // Gate next segment on keyframe timeline (rollover-safe).
  if (static_cast<uint32_t>(millis() - startAtMs_) < frames_[nextFrom].timeMs) {
    return;
  }

  String err;
  if (!beginSegment(nextFrom, &err)) {
    phase_ = TrackPhase::Stopped;
    state_->enterFault(FaultCode::TrackInfeasible);
  }
}

}  // namespace swarm
