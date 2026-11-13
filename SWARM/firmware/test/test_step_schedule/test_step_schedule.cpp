#include <unity.h>

#include "motor/step_schedule.h"

using swarm::ScheduleAction;
using swarm::evaluateStepSchedule;

void test_wait_until_interval() {
  const auto d = evaluateStepSchedule(400, 0, 500, 100000);
  TEST_ASSERT_EQUAL(static_cast<int>(ScheduleAction::Wait), static_cast<int>(d.action));
}

void test_ordinary_step() {
  const auto d = evaluateStepSchedule(500, 0, 500, 100000);
  TEST_ASSERT_EQUAL(static_cast<int>(ScheduleAction::Step), static_cast<int>(d.action));
  TEST_ASSERT_EQUAL_UINT32(500, d.nextLastStepMicros);
}

void test_late_resync_no_burst() {
  // 3x late — must resync, not schedule multiple steps.
  const auto d = evaluateStepSchedule(1500, 0, 500, 100000);
  TEST_ASSERT_EQUAL(static_cast<int>(ScheduleAction::StepResync), static_cast<int>(d.action));
  TEST_ASSERT_EQUAL_UINT32(1500, d.nextLastStepMicros);
}

void test_excessive_stall_aborts() {
  const auto d = evaluateStepSchedule(200000, 0, 500, 100000);
  TEST_ASSERT_EQUAL(static_cast<int>(ScheduleAction::StallAbort), static_cast<int>(d.action));
}

void test_micros_rollover() {
  const uint32_t last = 0xFFFFFFF0u;
  const uint32_t now = 0x00000010u;  // elapsed = 32
  const auto d = evaluateStepSchedule(now, last, 20, 100000);
  TEST_ASSERT_EQUAL(static_cast<int>(ScheduleAction::Step), static_cast<int>(d.action));
  TEST_ASSERT_EQUAL_UINT32(last + 20, d.nextLastStepMicros);
}

void test_never_more_than_one_decision_per_call() {
  // Even if hugely late but under abort, only StepResync (one step semantics).
  const auto d = evaluateStepSchedule(50000, 0, 1000, 100000);
  TEST_ASSERT_TRUE(d.action == ScheduleAction::StepResync || d.action == ScheduleAction::StallAbort);
  TEST_ASSERT_FALSE(d.action == ScheduleAction::Step && (50000u / 1000u) > 1);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_wait_until_interval);
  RUN_TEST(test_ordinary_step);
  RUN_TEST(test_late_resync_no_burst);
  RUN_TEST(test_excessive_stall_aborts);
  RUN_TEST(test_micros_rollover);
  RUN_TEST(test_never_more_than_one_decision_per_call);
  return UNITY_END();
}
