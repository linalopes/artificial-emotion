#include "track_player.h"

#include <math.h>
#include <string.h>

#include "../util/log.h"

namespace swarm {

void TrackPlayer::setCompletionReason(const char* reason) {
  if (!reason) {
    completionReason_[0] = '\0';
    return;
  }
  strncpy(completionReason_, reason, sizeof(completionReason_) - 1);
  completionReason_[sizeof(completionReason_) - 1] = '\0';
}

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
  activeTargetSteps_ = 0;
  boundaryDiag_ = BoundaryDiag{};
  completionReason_[0] = '\0';
}

void TrackPlayer::recordBoundary(LoopBoundaryAction action, int32_t expected, int32_t actual,
                                 int32_t tol) {
  boundaryDiag_.valid = true;
  boundaryDiag_.seq++;
  boundaryDiag_.passIndex = passIndex_;
  boundaryDiag_.expectedSteps = expected;
  boundaryDiag_.actualSteps = actual;
  boundaryDiag_.deltaSteps = actual - expected;
  const float spm = config_->stepsPerMm();
  boundaryDiag_.deltaMm = (spm > 0.0f) ? (static_cast<float>(boundaryDiag_.deltaSteps) / spm) : 0.0f;
  boundaryDiag_.tolSteps = tol;
  boundaryDiag_.action = action;
}

void TrackPlayer::recordSegmentResult(const char* result) {
  if (!result) {
    boundaryDiag_.segmentResult[0] = '\0';
    return;
  }
  strncpy(boundaryDiag_.segmentResult, result, sizeof(boundaryDiag_.segmentResult) - 1);
  boundaryDiag_.segmentResult[sizeof(boundaryDiag_.segmentResult) - 1] = '\0';
  boundaryDiag_.valid = true;
  boundaryDiag_.seq++;
}

bool TrackPlayer::resumeActiveTarget(String* error) {
  return planner_->moveToSteps(activeTargetSteps_, config_->get().speedRpm,
                               config_->get().accelerationMmS2, error);
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
  activeTargetSteps_ = 0;
  boundaryDiag_ = BoundaryDiag{};
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
  AutonomousPolicy normalized = policy;
  normalizeAutonomousPolicy(&normalized);
  const char* reason = nullptr;
  if (!validateAutonomousPolicy(normalized, &reason)) {
    if (error) {
      *error = reason ? reason : "invalid autonomous policy";
    }
    return false;
  }
  if (normalized.autonomous && normalized.loop && !loopCompatible()) {
    if (error) {
      *error = "track_not_loop_compatible";
    }
    return false;
  }
  policy_ = normalized;
  epochStartMs_ = startAtMillisLocal;
  phase_ = TrackPhase::Playing;
  index_ = 0;
  passIndex_ = 0;
  completedPasses_ = 0;
  started_ = false;  // becomes true when local start time is reached
  disconnectPendingStop_ = false;
  activeTargetSteps_ = 0;
  boundaryDiag_ = BoundaryDiag{};
  completionReason_[0] = '\0';
  SWARM_LOG("Track start_at local_ms=%lu autonomous=%d loop=%d max_runtime_ms=%lu",
            static_cast<unsigned long>(startAtMillisLocal), policy_.autonomous ? 1 : 0,
            policy_.loop ? 1 : 0, static_cast<unsigned long>(policy_.maxRuntimeMs));
  return true;
}

void TrackPlayer::stop() {
  planner_->requestControlledStop();
  phase_ = TrackPhase::Stopped;
  started_ = false;
  setCompletionReason("operator_stop");
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
  activeTargetSteps_ = targetSteps;
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
    setCompletionReason("max_runtime");
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
  setCompletionReason(policy_.maxLoops != 0 ? "max_loops" : "track_complete");
  SWARM_LOG("Track completed passes=%lu reason=%s",
            static_cast<unsigned long>(completedPasses_), completionReason_);
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
      setCompletionReason("max_runtime");
      return;
    }

    String err;
    const int32_t first = config_->mmToSteps(frames_[0].zMm);
    const int32_t actual = position_->steps();
    const int32_t tol = loopClosureToleranceSteps(config_->stepsPerMm());
    const int32_t delta = actual - first;
    const LoopBoundaryAction boundary =
        (passIndex_ == 0)
            ? ((actual == first) ? LoopBoundaryAction::AtStart : LoopBoundaryAction::CorrectivePrelude)
            : decideLoopBoundary(actual, first, tol);

    recordBoundary(boundary, first, actual, tol);

    if (boundary == LoopBoundaryAction::Fault) {
      // Outside SWARM_LOOP_CLOSURE_MM — refuse silent jump / model snap.
      recordSegmentResult("");
      phase_ = TrackPhase::Stopped;
      state_->enterFault(FaultCode::TrackInfeasible);
      SWARM_LOG("LoopBoundary FAULT pass=%lu expected=%ld actual=%ld delta=%ld tol=%ld",
                static_cast<unsigned long>(passIndex_), static_cast<long>(first),
                static_cast<long>(actual), static_cast<long>(delta), static_cast<long>(tol));
      return;
    }

    if (boundary == LoopBoundaryAction::CorrectivePrelude) {
      // Pass 0: move to start. Later passes: only when residual ≤ loop-closure mm —
      // physical prelude to first keyframe (planner move), never setSteps snap.
      if (passIndex_ > 0) {
        SWARM_LOG("LoopBoundary CORRECT pass=%lu expected=%ld actual=%ld delta=%ld tol=%ld",
                  static_cast<unsigned long>(passIndex_), static_cast<long>(first),
                  static_cast<long>(actual), static_cast<long>(delta), static_cast<long>(tol));
      }
      if (!planner_->moveToSteps(first, config_->get().speedRpm, config_->get().accelerationMmS2,
                                 &err)) {
        phase_ = TrackPhase::Stopped;
        state_->enterFault(FaultCode::TrackInfeasible);
        SWARM_LOG("LoopBoundary prelude failed pass=%lu err=%s",
                  static_cast<unsigned long>(passIndex_), err.c_str());
        return;
      }
      activeTargetSteps_ = first;
      state_->setMoving();
      phase_ = TrackPhase::SegmentActive;
      index_ = static_cast<size_t>(-2);
      return;
    }

    // Exactly at first keyframe steps — begin score segment 0.
    if (!beginSegment(0, &err)) {
      phase_ = TrackPhase::Stopped;
      state_->enterFault(FaultCode::TrackInfeasible);
      SWARM_LOG("LoopBoundary beginSegment0 failed pass=%lu err=%s",
                static_cast<unsigned long>(passIndex_), err.c_str());
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

  // Confirmed defect (0.3.6 overnight @ loop 103): idle was treated as segment-complete
  // even when IncompleteStop / controlled stop left targetReached_ false. Resume the
  // absolute target instead of advancing or finishing the pass from the wrong steps.
  const SegmentIdleAction idleAction = decideSegmentIdleAction(planner_->targetReached());
  if (idleAction == SegmentIdleAction::ResumeTarget) {
    String err;
    planner_->clearStall();
    if (!resumeActiveTarget(&err)) {
      recordSegmentResult(segmentCompletionLabel(idleAction, true));
      phase_ = TrackPhase::Stopped;
      state_->enterFault(FaultCode::TrackInfeasible);
      SWARM_LOG("Segment incomplete resume failed pass=%lu target=%ld actual=%ld err=%s",
                static_cast<unsigned long>(passIndex_), static_cast<long>(activeTargetSteps_),
                static_cast<long>(position_->steps()), err.c_str());
      return;
    }
    recordSegmentResult(segmentCompletionLabel(idleAction, false));
    state_->setMoving();
    SWARM_LOG("Segment incomplete resumed pass=%lu target=%ld actual=%ld",
              static_cast<unsigned long>(passIndex_), static_cast<long>(activeTargetSteps_),
              static_cast<long>(position_->steps()));
    return;
  }
  // Target reached — advance. Do not bump telemetry seq on the routine path (bounded traffic).

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
    setCompletionReason("max_runtime");
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
