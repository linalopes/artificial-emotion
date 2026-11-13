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
  clearAutonomousPolicy(&policy_);
  started_ = false;
  passIndex_ = 0;
  completedPasses_ = 0;
  disconnectPendingStop_ = false;
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
  clearAutonomousPolicy(&policy_);
  started_ = false;
  passIndex_ = 0;
  completedPasses_ = 0;
  disconnectPendingStop_ = false;
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

bool TrackPlayer::startAt(uint32_t startAtMillisLocal, const AutonomousPolicy& policy,
                          String* error) {
  if (phase_ != TrackPhase::Armed) {
    if (error) {
      *error = "not armed";
    }
    return false;
  }
  const char* reason = nullptr;
  if (!validateAutonomousPolicy(policy, &reason)) {
    if (error) {
      *error = reason ? reason : "invalid autonomous policy";
    }
    return false;
  }
  if (policy.autonomous && policy.loop && !loopCompatible()) {
    if (error) {
      *error = "track_not_loop_compatible";
    }
    return false;
  }
  policy_ = policy;
  epochStartMs_ = startAtMillisLocal;
  phase_ = TrackPhase::Playing;
  index_ = 0;
  passIndex_ = 0;
  completedPasses_ = 0;
  started_ = false;  // becomes true when local start time is reached
  disconnectPendingStop_ = false;
  SWARM_LOG("Track start_at local_ms=%lu autonomous=%d loop=%d",
            static_cast<unsigned long>(startAtMillisLocal), policy_.autonomous ? 1 : 0,
            policy_.loop ? 1 : 0);
  return true;
}

void TrackPlayer::stop() {
  planner_->requestControlledStop();
  phase_ = TrackPhase::Stopped;
  started_ = false;
  clearAutonomousPolicy(&policy_);
  if (state_->state() == ModuleState::Moving) {
    state_->setStopping();
  }
}

void TrackPlayer::onCoordinatorDisconnected(bool finishCurrentSegment) {
  // Case C: authorized autonomous run already started — continue full track / loops.
  if (policy_.autonomous && started_ &&
      (phase_ == TrackPhase::Playing || phase_ == TrackPhase::SegmentActive)) {
    SWARM_LOG("Disconnect: autonomous run continues");
    return;
  }

  // Case D: armed or waiting for local start — cancel; do not begin unsupervised.
  if (phase_ == TrackPhase::Armed || (phase_ == TrackPhase::Playing && !started_)) {
    phase_ = TrackPhase::Loaded;
    started_ = false;
    clearAutonomousPolicy(&policy_);
    SWARM_LOG("Disconnect: cancelled before start");
    return;
  }

  if (phase_ == TrackPhase::SegmentActive) {
    if (finishCurrentSegment) {
      disconnectPendingStop_ = true;
      SWARM_LOG("Disconnect: finishing current segment then stop");
      return;
    }
    stop();
    SWARM_LOG("Disconnect: controlled stop");
  }
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

uint32_t TrackPlayer::elapsedEpochMs(uint32_t nowMs) const {
  return static_cast<uint32_t>(nowMs - epochStartMs_);
}

bool TrackPlayer::runtimeExpired(uint32_t nowMs) const {
  return policy_.maxRuntimeMs != 0 && elapsedEpochMs(nowMs) >= policy_.maxRuntimeMs;
}

void TrackPlayer::finishPass(uint32_t nowMs) {
  completedPasses_++;
  if (runtimeExpired(nowMs)) {
    phase_ = TrackPhase::Completed;
    SWARM_LOG("Track completed (runtime expired) passes=%lu",
              static_cast<unsigned long>(completedPasses_));
    return;
  }
  if (mayStartNextLoop(policy_, completedPasses_, elapsedEpochMs(nowMs))) {
    // Epoch-relative next pass — no delay accumulation.
    passIndex_ = completedPasses_;
    index_ = 0;
    phase_ = TrackPhase::Playing;
    SWARM_LOG("Autonomous loop pass=%lu", static_cast<unsigned long>(passIndex_));
    return;
  }
  phase_ = TrackPhase::Completed;
  SWARM_LOG("Track completed passes=%lu", static_cast<unsigned long>(completedPasses_));
}

void TrackPlayer::service() {
  const uint32_t now = millis();

  if (phase_ == TrackPhase::Playing) {
    if (static_cast<int32_t>(now - epochStartMs_) < 0) {
      return;
    }
    if (!started_) {
      started_ = true;
    }
    if (runtimeExpired(now)) {
      phase_ = TrackPhase::Completed;
      return;
    }

    String err;
    const int32_t first = config_->mmToSteps(frames_[0].zMm);
    // First pass (and only when not already at start): prelude move. Loop restarts skip jump.
    if (position_->steps() != first) {
      if (passIndex_ > 0) {
        // Loop boundary violated mechanically — refuse silent jump.
        phase_ = TrackPhase::Stopped;
        state_->enterFault(FaultCode::TrackInfeasible);
        return;
      }
      if (!planner_->moveToSteps(first, config_->get().speedRpm, config_->get().accelerationMmS2,
                                 &err)) {
        phase_ = TrackPhase::Stopped;
        state_->enterFault(FaultCode::TrackInfeasible);
        return;
      }
      state_->setMoving();
      phase_ = TrackPhase::SegmentActive;
      index_ = static_cast<size_t>(-2);
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
    started_ = false;
    clearAutonomousPolicy(&policy_);
    SWARM_LOG("Disconnect policy: segment done, not starting next");
    return;
  }

  if (runtimeExpired(now)) {
    phase_ = TrackPhase::Completed;
    return;
  }

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
    finishPass(now);
    return;
  }

  const uint32_t due =
      epochOffsetMs(passIndex_, trackDurationMs(), frames_[nextFrom].timeMs);
  if (elapsedEpochMs(now) < due) {
    return;
  }

  String err;
  if (!beginSegment(nextFrom, &err)) {
    phase_ = TrackPhase::Stopped;
    state_->enterFault(FaultCode::TrackInfeasible);
  }
}

}  // namespace swarm
