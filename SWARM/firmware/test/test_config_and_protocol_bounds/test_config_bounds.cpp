#include <unity.h>

#include "config/config_rules.h"
#include "util/safe_string.h"

void test_module_id_bounds() {
  TEST_ASSERT_TRUE(swarm::rules::isValidModuleId("Mau01"));
  TEST_ASSERT_TRUE(swarm::rules::isValidModuleId("Mau09"));
  TEST_ASSERT_TRUE(swarm::rules::isValidModuleId("UNPROV"));
  TEST_ASSERT_FALSE(swarm::rules::isValidModuleId("Mau00"));
  TEST_ASSERT_FALSE(swarm::rules::isValidModuleId("Mau10"));
  TEST_ASSERT_FALSE(swarm::rules::isValidModuleId("mau01"));
  TEST_ASSERT_FALSE(swarm::rules::isValidModuleId(""));
}

void test_hard_ceiling_reject_above_abs() {
  TEST_ASSERT_NOT_NULL(swarm::rules::checkHardCeilingsLegal(SWARM_ABS_MAX_RPM + 1.0f, 100.0f, 1000.0f));
  TEST_ASSERT_NOT_NULL(swarm::rules::checkHardCeilingsLegal(6.0f, SWARM_ABS_MAX_ACCEL_MM_S2 + 1.0f, 1000.0f));
  TEST_ASSERT_NOT_NULL(swarm::rules::checkHardCeilingsLegal(6.0f, 100.0f, SWARM_ABS_MAX_TRAVEL_MM + 1.0f));
  TEST_ASSERT_NULL(swarm::rules::checkHardCeilingsLegal(6.0f, 100.0f, 1000.0f));
}

void test_clamp_corruption_cannot_raise() {
  swarm::rules::HardCeilings c{100.0f, 9999.0f, 99999.0f};
  swarm::rules::clampHardCeilings(c);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, SWARM_ABS_MAX_RPM, c.hardMaxRpm);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, SWARM_ABS_MAX_ACCEL_MM_S2, c.hardMaxAccelMmS2);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, SWARM_ABS_MAX_TRAVEL_MM, c.hardMaxTravelMm);
}

void test_safe_string_always_terminated() {
  char buf[5];
  memset(buf, 'X', sizeof(buf));
  swarm::copyToFixed(buf, sizeof(buf), "ABCDEFGH");
  TEST_ASSERT_EQUAL_STRING("ABCD", buf);
  TEST_ASSERT_EQUAL_CHAR('\0', buf[4]);
}

void test_message_size_reject() {
  TEST_ASSERT_FALSE(swarm::rules::messageTooLarge(100));
  TEST_ASSERT_TRUE(swarm::rules::messageTooLarge(SWARM_MAX_WS_MESSAGE_BYTES + 1));
  TEST_ASSERT_FALSE(swarm::rules::messageTooLarge(SWARM_MAX_WS_MESSAGE_BYTES));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_module_id_bounds);
  RUN_TEST(test_hard_ceiling_reject_above_abs);
  RUN_TEST(test_clamp_corruption_cannot_raise);
  RUN_TEST(test_safe_string_always_terminated);
  RUN_TEST(test_message_size_reject);
  return UNITY_END();
}
