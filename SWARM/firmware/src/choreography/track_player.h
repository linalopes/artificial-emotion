#pragma once

#include <Arduino.h>

#include "../config/config_store.h"
#include "../motor/motion_planner.h"
#include "../position/position.h"
#include "../system/module_state.h"
#include "autonomous_policy.h"

namespace swarm {

struct TrackKeyframe {
  uint32_t timeMs = 0;
  float zMm = 0;
};

constexpr size_t kMaxTrackKeyframes = 32;

enum class TrackPhase : uint8_t {
  Idle = 0,
  Loaded,
  Armed,
  Playing,
  SegmentActive,
  Completed,
  Stopped,
};

class TrackPlayer {
 public:
  void begin(MotionPlanner* planner, PositionModel* position, ConfigStore* config,
             ModuleStateMachine* state);

  bool load(const char* presetId, uint32_t revision, const TrackKeyframe* frames, size_t count,
            String* error);
  bool prepareStart(String* error);
  /** Arm local start. policy is copied for this playback only. */
  bool startAt(uint32_t startAtMillisLocal, const AutonomousPolicy& policy, String* error);
  bool startAt(uint32_t startAtMillisLocal, String* error) {
    return startAt(startAtMillisLocal, AutonomousPolicy{}, error);
  }
  void stop();
  /** Coordinator link lost. Autonomous runs that have started continue; others follow policy. */
  void onCoordinatorDisconnected(bool finishCurrentSegment);

  void service();

  TrackPhase phase() const { return phase_; }
  const char* presetId() const { return presetId_; }
  uint32_t revision() const { return revision_; }
  size_t keyframeCount() const { return count_; }
  size_t currentIndex() const { return index_; }
  bool hasTrack() const { return count_ >= 2; }
  bool autonomousActive() const { return policy_.autonomous && started_; }
  bool started() const { return started_; }
  const AutonomousPolicy& policy() const { return policy_; }
  uint32_t passIndex() const { return passIndex_; }  // 0-based current pass
  uint32_t completedPasses() const { return completedPasses_; }
  uint32_t epochStartMs() const { return epochStartMs_; }
  uint32_t trackDurationMs() const { return count_ >= 2 ? frames_[count_ - 1].timeMs : 0; }
  float firstZMm() const { return count_ > 0 ? frames_[0].zMm : 0; }
  float lastZMm() const { return count_ > 0 ? frames_[count_ - 1].zMm : 0; }
  bool loopCompatible() const {
    return count_ >= 2 && trackLoopCompatible(frames_[0].zMm, frames_[count_ - 1].zMm);
  }

  /** Last loop-boundary / segment-completion diagnostic (bounded; for status telemetry). */
  struct BoundaryDiag {
    bool valid = false;
    uint32_t seq = 0;
    uint32_t passIndex = 0;
    int32_t expectedSteps = 0;
    int32_t actualSteps = 0;
    int32_t deltaSteps = 0;
    float deltaMm = 0;
    int32_t tolSteps = 0;
    LoopBoundaryAction action = LoopBoundaryAction::AtStart;
    /** "reached" | "incomplete_resumed" | "incomplete_fault" | "" */
    char segmentResult[24] = "";
  };
  const BoundaryDiag& boundaryDiag() const { return boundaryDiag_; }

 private:
  MotionPlanner* planner_ = nullptr;
  PositionModel* position_ = nullptr;
  ConfigStore* config_ = nullptr;
  ModuleStateMachine* state_ = nullptr;

  TrackKeyframe frames_[kMaxTrackKeyframes];
  size_t count_ = 0;
  size_t index_ = 0;
  char presetId_[24] = "";
  uint32_t revision_ = 0;
  TrackPhase phase_ = TrackPhase::Idle;
  uint32_t epochStartMs_ = 0;
  bool disconnectPendingStop_ = false;
  AutonomousPolicy policy_{};
  bool started_ = false;
  uint32_t passIndex_ = 0;
  uint32_t completedPasses_ = 0;
  int32_t activeTargetSteps_ = 0;
  BoundaryDiag boundaryDiag_{};

  bool validateFeasibility(String* error) const;
  bool beginSegment(size_t fromIndex, String* error);
  uint32_t elapsedEpochMs(uint32_t nowMs) const;
  bool runtimeExpired(uint32_t nowMs) const;
  void finishPass(uint32_t nowMs);
  void recordBoundary(LoopBoundaryAction action, int32_t expected, int32_t actual, int32_t tol);
  void recordSegmentResult(const char* result);
  bool resumeActiveTarget(String* error);
};

}  // namespace swarm
