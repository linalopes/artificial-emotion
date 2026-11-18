#include <cstdio>
#include <cstring>
#include <unity.h>

#include <swarm_limits.h>

#include "choreography/autonomous_policy.h"
#include "net/ws_reconnect_policy.h"

using swarm::AutonomousPolicy;
using swarm::DisconnectPlayAction;
using swarm::LoopBoundaryAction;
using swarm::SegmentIdleAction;
using swarm::decideDisconnectAction;
using swarm::decideLoopBoundary;
using swarm::decideSegmentIdleAction;
using swarm::epochOffsetMs;
using swarm::loopBoundaryActionLabel;
using swarm::loopClosureToleranceSteps;
using swarm::mayStartNextLoop;
using swarm::normalizeAutonomousPolicy;
using swarm::segmentCompletionLabel;
using swarm::shouldAttemptWsReconnect;
using swarm::shouldDeferWsReconnect;
using swarm::shouldServiceWsClient;
using swarm::trackLoopCompatible;
using swarm::validateAutonomousPolicy;
using swarm::wsTcpTimeoutMs;

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

void test_loop_closure_tolerance_steps_matches_mm_gate() {
  // Firmware default spool 15 mm → ≈ 86.92 steps/mm → 1 mm closure ≈ 87 steps (ceil).
  const float spmDefault = 86.91981958725378f;
  const int32_t tolDefault = loopClosureToleranceSteps(spmDefault, SWARM_LOOP_CLOSURE_MM);
  TEST_ASSERT_TRUE(tolDefault >= 86);
  TEST_ASSERT_TRUE(tolDefault <= 88);
  // Alternate geometry still maps 1 mm → ceil(spm).
  const float spmAlt = 43.45990979362689f;
  const int32_t tolAlt = loopClosureToleranceSteps(spmAlt, SWARM_LOOP_CLOSURE_MM);
  TEST_ASSERT_TRUE(tolAlt >= 43);
  TEST_ASSERT_TRUE(tolAlt <= 45);
  TEST_ASSERT_EQUAL_INT32(1, loopClosureToleranceSteps(0.0f));
  TEST_ASSERT_EQUAL_INT32(1, loopClosureToleranceSteps(-1.0f));
}

void test_loop_boundary_actions() {
  const int32_t first = 5729;  // Mau03 Wave start steps at default geometry
  const int32_t tol = 44;
  TEST_ASSERT_EQUAL(static_cast<int>(LoopBoundaryAction::AtStart),
                    static_cast<int>(decideLoopBoundary(first, first, tol)));
  TEST_ASSERT_EQUAL(static_cast<int>(LoopBoundaryAction::CorrectivePrelude),
                    static_cast<int>(decideLoopBoundary(first + 1, first, tol)));
  TEST_ASSERT_EQUAL(static_cast<int>(LoopBoundaryAction::CorrectivePrelude),
                    static_cast<int>(decideLoopBoundary(first - 1, first, tol)));
  TEST_ASSERT_EQUAL(static_cast<int>(LoopBoundaryAction::CorrectivePrelude),
                    static_cast<int>(decideLoopBoundary(first + tol, first, tol)));
  TEST_ASSERT_EQUAL(static_cast<int>(LoopBoundaryAction::Fault),
                    static_cast<int>(decideLoopBoundary(first + tol + 1, first, tol)));
  TEST_ASSERT_EQUAL(static_cast<int>(LoopBoundaryAction::Fault),
                    static_cast<int>(decideLoopBoundary(first - (tol + 1), first, tol)));
}

/** Regression: 0.3.5 exact-step gate faulted fleets ~loop 74; residual ≤ closure must correct. */
void test_loop_boundary_1000_transitions_wave_like() {
  const int32_t first = 5729;
  const int32_t tol = loopClosureToleranceSteps(43.45990979362689f);
  int corrections = 0;
  int faults = 0;
  int atStart = 0;
  // Closed-loop: mostly exact; inject small ± residuals and rounding-edge cases.
  for (int i = 0; i < 1000; i++) {
    int32_t actual = first;
    if (i % 17 == 0) {
      actual = first + 1;  // +1 step residual
    } else if (i % 19 == 0) {
      actual = first - 1;
    } else if (i % 53 == 0) {
      actual = first + tol;  // edge of closure
    } else if (i % 59 == 0) {
      actual = first - tol;
    } else if (i % 97 == 0) {
      actual = first + tol + 1;  // genuine out-of-tolerance
    } else if (i % 101 == 0) {
      actual = first + 500;  // travel-scale error (would also fail soft-limit prelude)
    }
    const LoopBoundaryAction a = decideLoopBoundary(actual, first, tol);
    if (a == LoopBoundaryAction::AtStart) {
      atStart++;
    } else if (a == LoopBoundaryAction::CorrectivePrelude) {
      corrections++;
      // Correction returns to exact first — no model snap; next loop clean.
      actual = first;
      TEST_ASSERT_EQUAL(static_cast<int>(LoopBoundaryAction::AtStart),
                        static_cast<int>(decideLoopBoundary(actual, first, tol)));
    } else {
      faults++;
      TEST_ASSERT_TRUE(actual - first > tol || first - actual > tol);
    }
  }
  TEST_ASSERT_TRUE(atStart > 800);
  TEST_ASSERT_TRUE(corrections > 0);
  TEST_ASSERT_TRUE(faults > 0);
  // Exact-equality gate would have faulted every nonzero residual (corrections+faults).
  TEST_ASSERT_TRUE(corrections + faults > faults);
}

void test_loop_boundary_interrupted_equals_fault_when_far() {
  // Cancelled / incomplete trajectory left far from first keyframe → still FAULT.
  TEST_ASSERT_EQUAL(static_cast<int>(LoopBoundaryAction::Fault),
                    static_cast<int>(decideLoopBoundary(100, 5729, 44)));
}

void test_segment_idle_requires_target_reached() {
  TEST_ASSERT_EQUAL(static_cast<int>(SegmentIdleAction::Advance),
                    static_cast<int>(decideSegmentIdleAction(true)));
  TEST_ASSERT_EQUAL(static_cast<int>(SegmentIdleAction::ResumeTarget),
                    static_cast<int>(decideSegmentIdleAction(false)));
  TEST_ASSERT_EQUAL_STRING("CONTINUE", loopBoundaryActionLabel(LoopBoundaryAction::AtStart));
  TEST_ASSERT_EQUAL_STRING("CORRECT",
                           loopBoundaryActionLabel(LoopBoundaryAction::CorrectivePrelude));
  TEST_ASSERT_EQUAL_STRING("FAULT", loopBoundaryActionLabel(LoopBoundaryAction::Fault));
  TEST_ASSERT_EQUAL_STRING("reached",
                           segmentCompletionLabel(SegmentIdleAction::Advance, false));
  TEST_ASSERT_EQUAL_STRING("incomplete_resumed",
                           segmentCompletionLabel(SegmentIdleAction::ResumeTarget, false));
  TEST_ASSERT_EQUAL_STRING("incomplete_fault",
                           segmentCompletionLabel(SegmentIdleAction::ResumeTarget, true));
}

/**
 * Overnight 0.3.6 failure class: IncompleteStop treated as complete → wrong loop start.
 * Model: each loop ends with optional incomplete last-segment residual; must Resume then
 * Correct/Continue at boundary — never Advance while !targetReached.
 */
void test_incomplete_segment_then_1000_loop_transitions() {
  const float spm = 86.91981958725378f;
  const int32_t first = static_cast<int32_t>(250.0f * spm + 0.5f);  // centerMm Wave
  const int32_t tol = loopClosureToleranceSteps(spm);
  int resumes = 0;
  int advances = 0;
  int corrections = 0;
  int faults = 0;
  int32_t pos = first;

  for (int loop = 0; loop < 1000; loop++) {
    // Simulate last-segment planner idle.
    bool reached = true;
    if (loop % 23 == 0) {
      // IncompleteStop short of last/first keyframe by a few steps (≤1 mm).
      reached = false;
      pos = first + 3;
    } else if (loop % 29 == 0) {
      reached = false;
      pos = first - (tol - 1);  // still within closure after resume-to-target fails? resume first
    } else if (loop % 31 == 0) {
      reached = false;
      pos = first + tol + 20;  // far incomplete — resume would re-target; boundary FAULT if skipped
    } else {
      pos = first;
    }

    const SegmentIdleAction seg = decideSegmentIdleAction(reached);
    if (seg == SegmentIdleAction::ResumeTarget) {
      resumes++;
      // Firmware re-issues moveToSteps(activeTarget); physical completion → exact first.
      pos = first;
      reached = true;
      TEST_ASSERT_EQUAL(static_cast<int>(SegmentIdleAction::Advance),
                        static_cast<int>(decideSegmentIdleAction(reached)));
      advances++;
    } else {
      advances++;
    }

    // Only after targetReached may the loop boundary run.
    const LoopBoundaryAction boundary = decideLoopBoundary(pos, first, tol);
    if (boundary == LoopBoundaryAction::AtStart) {
      // continue
    } else if (boundary == LoopBoundaryAction::CorrectivePrelude) {
      corrections++;
      pos = first;
    } else {
      faults++;
      TEST_ASSERT_TRUE(pos - first > tol || first - pos > tol);
    }
  }

  TEST_ASSERT_TRUE(resumes > 0);
  TEST_ASSERT_TRUE(advances >= 1000);
  TEST_ASSERT_EQUAL_INT(0, faults);  // all incompletes resumed to target before boundary
  TEST_ASSERT_TRUE(corrections == 0);  // resume restored exact first
}

void test_wifi_disconnect_keeps_autonomous_policy() {
  // Temporary Wi-Fi loss must not cancel an already-started autonomous run.
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectPlayAction::ContinueAutonomous),
                    static_cast<int>(decideDisconnectAction(false, true, true, true)));
  TEST_ASSERT_EQUAL(static_cast<int>(DisconnectPlayAction::ContinueAutonomous),
                    static_cast<int>(decideDisconnectAction(false, true, true, false)));
}

void test_long_running_continuous_may_start_next_loop() {
  AutonomousPolicy p{};
  p.autonomous = true;
  p.loop = true;
  p.continuous = true;
  // Unnormalized continuous + maxRuntimeMs==0 remains unbounded (legacy wire form).
  for (uint32_t passes = 1; passes <= 2000; passes++) {
    TEST_ASSERT_TRUE(mayStartNextLoop(p, passes, passes * 240000u));
  }
}

void test_normalize_continuous_injects_12h_ceiling() {
  AutonomousPolicy p{};
  p.autonomous = true;
  p.loop = true;
  p.continuous = true;
  p.maxRuntimeMs = 0;
  normalizeAutonomousPolicy(&p);
  TEST_ASSERT_EQUAL_UINT32(SWARM_AUTONOMOUS_MAX_RUNTIME_MS, p.maxRuntimeMs);
  TEST_ASSERT_TRUE(mayStartNextLoop(p, 100, SWARM_AUTONOMOUS_MAX_RUNTIME_MS - 1));
  TEST_ASSERT_FALSE(mayStartNextLoop(p, 100, SWARM_AUTONOMOUS_MAX_RUNTIME_MS));
  TEST_ASSERT_FALSE(mayStartNextLoop(p, 100, SWARM_AUTONOMOUS_MAX_RUNTIME_MS + 1));

  // Explicit override under ceiling is preserved.
  p.maxRuntimeMs = 600000;
  normalizeAutonomousPolicy(&p);
  TEST_ASSERT_EQUAL_UINT32(600000u, p.maxRuntimeMs);
}

/** Mac/coordinator unavailable: never attempt or service WS while autonomy is active. */
void test_ws_reconnect_deferred_during_autonomy() {
  TEST_ASSERT_TRUE(shouldDeferWsReconnect(true, false));
  TEST_ASSERT_FALSE(shouldDeferWsReconnect(true, true));
  TEST_ASSERT_FALSE(shouldDeferWsReconnect(false, false));

  // 15 min / 1 h / longer — policy is time-invariant while autonomy holds.
  const uint32_t windows[] = {15u * 60u * 1000u, 60u * 60u * 1000u, 12u * 60u * 60u * 1000u};
  for (uint32_t w : windows) {
    TEST_ASSERT_FALSE(shouldAttemptWsReconnect(true, true, false, true, w, 0, 5000));
    TEST_ASSERT_FALSE(shouldServiceWsClient(true, false, true));
  }
}

void test_ws_reconnect_paced_after_autonomy() {
  // After autonomous ends, reconnect is allowed but paced (no tight retry).
  TEST_ASSERT_TRUE(shouldAttemptWsReconnect(true, true, false, false, 10'000, 0, 5000));
  TEST_ASSERT_FALSE(shouldAttemptWsReconnect(true, true, false, false, 10'000, 6000, 5000));
  TEST_ASSERT_TRUE(shouldAttemptWsReconnect(true, true, false, false, 11'001, 6000, 5000));
  // Repeated failed attempts stay paced.
  uint32_t last = 0;
  int attempts = 0;
  for (uint32_t now = 1; now <= 60'000; now += 50) {
    if (shouldAttemptWsReconnect(true, true, false, false, now, last, 5000)) {
      attempts++;
      last = now;
    }
  }
  TEST_ASSERT_TRUE(attempts >= 10);
  TEST_ASSERT_TRUE(attempts <= 13);  // ~1 / 5 s over 60 s
  TEST_ASSERT_TRUE(shouldServiceWsClient(true, false, false));
  TEST_ASSERT_TRUE(wsTcpTimeoutMs() < (SWARM_STALL_ABORT_US / 1000u));
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
  RUN_TEST(test_loop_closure_tolerance_steps_matches_mm_gate);
  RUN_TEST(test_loop_boundary_actions);
  RUN_TEST(test_loop_boundary_1000_transitions_wave_like);
  RUN_TEST(test_loop_boundary_interrupted_equals_fault_when_far);
  RUN_TEST(test_segment_idle_requires_target_reached);
  RUN_TEST(test_incomplete_segment_then_1000_loop_transitions);
  RUN_TEST(test_wifi_disconnect_keeps_autonomous_policy);
  RUN_TEST(test_long_running_continuous_may_start_next_loop);
  RUN_TEST(test_normalize_continuous_injects_12h_ceiling);
  RUN_TEST(test_ws_reconnect_deferred_during_autonomy);
  RUN_TEST(test_ws_reconnect_paced_after_autonomy);
  return UNITY_END();
}
