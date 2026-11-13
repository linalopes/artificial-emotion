#pragma once

#include <Arduino.h>

#include "../config/config_store.h"
#include "../motor/motion_planner.h"
#include "../position/position.h"
#include "../system/module_state.h"

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
  bool startAt(uint32_t startAtMillisLocal, String* error);
  void stop();
  void onCoordinatorDisconnected(bool finishCurrentSegment);

  void service();

  TrackPhase phase() const { return phase_; }
  const char* presetId() const { return presetId_; }
  uint32_t revision() const { return revision_; }
  size_t keyframeCount() const { return count_; }
  size_t currentIndex() const { return index_; }
  bool hasTrack() const { return count_ >= 2; }

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
  uint32_t startAtMs_ = 0;
  bool disconnectPendingStop_ = false;

  bool validateFeasibility(String* error) const;
  bool beginSegment(size_t fromIndex, String* error);
};

}  // namespace swarm
