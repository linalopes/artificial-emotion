#include <cstdio>
#include <cstring>
#include <unity.h>

#include <swarm_limits.h>

#include "config/config_rules.h"
#include "motor/step_schedule.h"
#include "net/idempotency.h"
#include "util/safe_string.h"
#include "util/timing_host.h"

using swarm::IdempotencyCache;
using swarm::ScheduleAction;
using swarm::evaluateStepSchedule;
using swarm::validateStartAtDelayMs;

void test_idempotency_duplicate_returns_same_ack() {
  IdempotencyCache cache;
  cache.beginSession();
  cache.remember("cmd-1", true, "homing started");
  bool ok = false;
  char detail[80];
  TEST_ASSERT_TRUE(cache.lookup("cmd-1", &ok, detail, sizeof(detail)));
  TEST_ASSERT_TRUE(ok);
  TEST_ASSERT_EQUAL_STRING("homing started", detail);
  cache.remember("cmd-1", false, "should not overwrite in lookup path");
  // Second remember of same id creates another slot; lookup finds first match.
  TEST_ASSERT_TRUE(cache.lookup("cmd-1", &ok, detail, sizeof(detail)));
}

void test_idempotency_session_clears_on_reconnect() {
  IdempotencyCache cache;
  cache.beginSession();
  cache.remember("cmd-home", true, "homing started");
  const uint32_t s1 = cache.session();
  cache.beginSession();
  TEST_ASSERT_NOT_EQUAL(s1, cache.session());
  bool ok = false;
  TEST_ASSERT_FALSE(cache.lookup("cmd-home", &ok, nullptr, 0));
}

void test_idempotency_capacity_bounded() {
  IdempotencyCache cache;
  cache.beginSession();
  for (size_t i = 0; i < IdempotencyCache::kCapacity + 4; i++) {
    char id[16];
    snprintf(id, sizeof(id), "id-%u", static_cast<unsigned>(i));
    cache.remember(id, true, "ok");
  }
  bool ok = false;
  // Oldest should be gone; newest present.
  TEST_ASSERT_FALSE(cache.lookup("id-0", &ok, nullptr, 0));
  TEST_ASSERT_TRUE(cache.lookup("id-19", &ok, nullptr, 0));
}

void test_delay_ms_validation() {
  TEST_ASSERT_NULL(validateStartAtDelayMs(0, SWARM_START_AT_MAX_DELAY_MS));
  TEST_ASSERT_NULL(validateStartAtDelayMs(500, SWARM_START_AT_MAX_DELAY_MS));
  TEST_ASSERT_NULL(validateStartAtDelayMs(static_cast<long>(SWARM_START_AT_MAX_DELAY_MS),
                                          SWARM_START_AT_MAX_DELAY_MS));
  TEST_ASSERT_NOT_NULL(validateStartAtDelayMs(-1, SWARM_START_AT_MAX_DELAY_MS));
  TEST_ASSERT_NOT_NULL(validateStartAtDelayMs(static_cast<long>(SWARM_START_AT_MAX_DELAY_MS) + 1,
                                              SWARM_START_AT_MAX_DELAY_MS));
}

void test_millis_rollover_deadline() {
  const uint32_t start = 0xFFFFFFF0u;
  const uint32_t now = 0x00000010u;  // elapsed 32
  TEST_ASSERT_EQUAL_UINT32(32u, swarm::elapsedUint32(now, start));
  TEST_ASSERT_FALSE(swarm::deadlineReached(now, start, 100));
  TEST_ASSERT_TRUE(swarm::deadlineReached(now, start, 32));
}

void test_choreography_time_gate_rollover_safe() {
  // Mirrors track_player: (millis - startAt) < frameTime
  const uint32_t startAt = 0xFFFFFFF0u;
  const uint32_t frameTime = 100;
  const uint32_t before = startAt + 50;  // wraps
  TEST_ASSERT_TRUE(swarm::elapsedUint32(before, startAt) < frameTime);
  const uint32_t after = startAt + 150;
  TEST_ASSERT_FALSE(swarm::elapsedUint32(after, startAt) < frameTime);
}

void test_schedule_stall_and_no_burst() {
  const auto wait = evaluateStepSchedule(100, 0, 500, 100000);
  TEST_ASSERT_EQUAL(static_cast<int>(ScheduleAction::Wait), static_cast<int>(wait.action));
  const auto late = evaluateStepSchedule(2000, 0, 500, 100000);
  TEST_ASSERT_EQUAL(static_cast<int>(ScheduleAction::StepResync), static_cast<int>(late.action));
  const auto abort = evaluateStepSchedule(200000, 0, 500, 100000);
  TEST_ASSERT_EQUAL(static_cast<int>(ScheduleAction::StallAbort), static_cast<int>(abort.action));
}

void test_config_bounds_and_identity() {
  TEST_ASSERT_TRUE(swarm::rules::isValidModuleId("Mau03"));
  TEST_ASSERT_FALSE(swarm::rules::isValidModuleId("Mau99"));
  TEST_ASSERT_NOT_NULL(swarm::rules::checkHardCeilingsLegal(SWARM_ABS_MAX_RPM + 1.f, 10.f, 10.f));
  swarm::rules::HardCeilings c{99.f, 9999.f, 99999.f};
  swarm::rules::clampHardCeilings(c);
  TEST_ASSERT(c.hardMaxRpm <= SWARM_ABS_MAX_RPM + 0.001f);
}

void test_message_too_large_and_safe_string() {
  TEST_ASSERT_TRUE(swarm::rules::messageTooLarge(SWARM_MAX_WS_MESSAGE_BYTES + 1));
  char buf[4];
  memset(buf, 'Z', sizeof(buf));
  swarm::copyToFixed(buf, sizeof(buf), "TOOLONG");
  TEST_ASSERT_EQUAL_STRING("TOO", buf);
}

void test_empty_message_id_not_cached() {
  IdempotencyCache cache;
  cache.beginSession();
  cache.remember("", true, "should ignore");
  bool ok = true;
  TEST_ASSERT_FALSE(cache.lookup("", &ok, nullptr, 0));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_idempotency_duplicate_returns_same_ack);
  RUN_TEST(test_idempotency_session_clears_on_reconnect);
  RUN_TEST(test_idempotency_capacity_bounded);
  RUN_TEST(test_delay_ms_validation);
  RUN_TEST(test_millis_rollover_deadline);
  RUN_TEST(test_choreography_time_gate_rollover_safe);
  RUN_TEST(test_schedule_stall_and_no_burst);
  RUN_TEST(test_config_bounds_and_identity);
  RUN_TEST(test_message_too_large_and_safe_string);
  RUN_TEST(test_empty_message_id_not_cached);
  return UNITY_END();
}
