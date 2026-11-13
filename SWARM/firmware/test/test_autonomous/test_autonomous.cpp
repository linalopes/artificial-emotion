#include <cstdio>
#include <cstring>
#include <unity.h>

#include <swarm_limits.h>

#include "choreography/autonomous_policy.h"

using swarm::AutonomousPolicy;
using swarm::DisconnectPlayAction;
using swarm::decideDisconnectAction;
using swarm::epochOffsetMs;
using swarm::mayStartNextLoop;
using swarm::trackLoopCompatible;
using swarm::validateAutonomousPolicy;

void test_policy_defaults_ok() {
  AutonomousPolicy p{};
  const char* reason = nullptr;
  TEST_ASSERT_TRUE(validateAutonomousPolicy(p, &reason));
}

void test_reject_fields_without_autonomous() {
  AutonomousPolicy p{};
  p.loop = true;
  const char* reason = nullptr;
  TEST_ASSERT_FALSE(validateAutonomousPolicy(p, &reason));
  TEST_ASSERT_EQUAL_STRING("autonomous_fields_without_autonomous", reason);
}

void test_loop_requires_bound_or_continuous() {
  AutonomousPolicy p{};
  p.autonomous = true;
  p.loop = true;
  const char* reason = nullptr;
  TEST_ASSERT_FALSE(validateAutonomousPolicy(p, &reason));
  TEST_ASSERT_EQUAL_STRING("loop_requires_bound_or_continuous", reason);

  p.maxLoops = 3;
  TEST_ASSERT_TRUE(validateAutonomousPolicy(p, &reason));

  p.maxLoops = 0;
  p.maxRuntimeMs = 60'000;
  TEST_ASSERT_TRUE(validateAutonomousPolicy(p, &reason));

  p.maxRuntimeMs = 0;
  p.continuous = true;
  TEST_ASSERT_TRUE(validateAutonomousPolicy(p, &reason));
}

void test_continuous_requires_loop() {
  AutonomousPolicy p{};
  p.autonomous = true;
  p.continuous = true;
  const char* reason = nullptr;
  TEST_ASSERT_FALSE(validateAutonomousPolicy(p, &reason));
}

void test_loop_closure() {
  TEST_ASSERT_TRUE(trackLoopCompatible(100.0f, 100.0f));
  TEST_ASSERT_TRUE(trackLoopCompatible(100.0f, 100.5f));
  TEST_ASSERT_FALSE(trackLoopCompatible(100.0f, 102.0f));
}

void test_epoch_scheduling_no_cumulative_delay() {
  // Pass 2, keyframe at 5000 ms on a 10000 ms track → 25000 from epoch.
  TEST_ASSERT_EQUAL_UINT32(25000u, epochOffsetMs(2, 10000u, 5000u));
  TEST_ASSERT_EQUAL_UINT32(0u, epochOffsetMs(0, 10000u, 0u));
}

void test_may_start_next_loop_bounds() {
  AutonomousPolicy p{};
  p.autonomous = true;
  p.loop = true;
  p.maxLoops = 2;
  TEST_ASSERT_TRUE(mayStartNextLoop(p, 1, 1000));
  TEST_ASSERT_FALSE(mayStartNextLoop(p, 2, 1000));

  p.maxLoops = 0;
  p.maxRuntimeMs = 5000;
  TEST_ASSERT_TRUE(mayStartNextLoop(p, 99, 4999));
  TEST_ASSERT_FALSE(mayStartNextLoop(p, 99, 5000));

  p.maxRuntimeMs = 0;
  p.continuous = true;
  TEST_ASSERT_TRUE(mayStartNextLoop(p, 9999, 1'000'000));
}

void test_disconnect_actions() {
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectPlayAction::ContinueAutonomous),
                    static_cast<int>(decideDisconnectAction(false, true, true, true)));
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectPlayAction::CancelBeforeStart),
                    static_cast<int>(decideDisconnectAction(true, false, false, true)));
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectPlayAction::FinishSegmentThenStop),
                    static_cast<int>(decideDisconnectAction(false, true, false, true)));
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectPlayAction::ControlledStop),
                    static_cast<int>(decideDisconnectAction(false, true, false, false)));
}

void test_max_caps() {
  AutonomousPolicy p{};
  p.autonomous = true;
  p.loop = true;
  p.maxLoops = SWARM_AUTONOMOUS_MAX_LOOPS_CAP + 1;
  const char* reason = nullptr;
  TEST_ASSERT_FALSE(validateAutonomousPolicy(p, &reason));
  p.maxLoops = 1;
  p.maxRuntimeMs = SWARM_AUTONOMOUS_MAX_RUNTIME_MS + 1;
  TEST_ASSERT_FALSE(validateAutonomousPolicy(p, &reason));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_policy_defaults_ok);
  RUN_TEST(test_reject_fields_without_autonomous);
  RUN_TEST(test_loop_requires_bound_or_continuous);
  RUN_TEST(test_continuous_requires_loop);
  RUN_TEST(test_loop_closure);
  RUN_TEST(test_epoch_scheduling_no_cumulative_delay);
  RUN_TEST(test_may_start_next_loop_bounds);
  RUN_TEST(test_disconnect_actions);
  RUN_TEST(test_max_caps);
  return UNITY_END();
}
