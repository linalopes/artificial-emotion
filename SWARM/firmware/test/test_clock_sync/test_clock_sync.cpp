#include <climits>
#include <cstdio>
#include <cstring>
#include <unity.h>

#include <swarm_limits.h>

#include "choreography/run_schedule.h"
#include "sync/clock_sync.h"

using swarm::ClockSync;

static void exchangeSample(ClockSync& node, int64_t trueOffsetUs, uint64_t oneWayUs,
                           uint32_t seq, uint64_t* coordNow) {
  // Mac t1, delay oneWay, node t2=t1+oneWay+offset, t3=t2, delay oneWay, Mac t4.
  const uint64_t t1 = *coordNow;
  const uint64_t t2 = static_cast<uint64_t>(static_cast<int64_t>(t1 + oneWayUs) + trueOffsetUs);
  uint64_t out2 = 0, out3 = 0;
  node.onSyncReq(t1, seq, t2, &out2, &out3);
  const uint64_t t3 = out3;
  const uint64_t t4 = t1 + 2 * oneWayUs;
  *coordNow = t4 + 1;
  const char* reason = nullptr;
  TEST_ASSERT_TRUE(node.onSyncFin(t1, out2, t3, t4, seq, t3 + 100, &reason));
}

void test_symmetric_delay_converges() {
  ClockSync clk;
  clk.begin();
  uint64_t coord = 1'000'000ull;
  const int64_t trueOff = 5'000'000ll;  // node 5s ahead
  for (uint32_t i = 0; i < 5; i++) {
    exchangeSample(clk, trueOff, 2'000ull, i + 1, &coord);  // 2ms one-way → 4ms RTT
  }
  TEST_ASSERT_TRUE(clk.isSynced());
  TEST_ASSERT_INT_WITHIN(500, trueOff, clk.offsetUs());
  TEST_ASSERT_TRUE(clk.uncertaintyUs() <= SWARM_CLOCK_DEFAULT_UNCERTAINTY_MAX_US);
}

void test_reject_large_rtt() {
  ClockSync clk;
  clk.begin();
  uint64_t t2 = 0, t3 = 0;
  clk.onSyncReq(1000, 1, 2000, &t2, &t3);
  const char* reason = nullptr;
  // RTT = (t4-t1)-(t3-t2) huge
  TEST_ASSERT_FALSE(clk.onSyncFin(1000, t2, t3, 1000 + SWARM_CLOCK_MAX_RTT_US + 50'000ull, 1,
                                  t3, &reason));
  TEST_ASSERT_FALSE(clk.isSynced());
}

void test_session_invalidates() {
  ClockSync clk;
  clk.begin();
  TEST_ASSERT_TRUE(clk.addSample(1000, 1000, 10'000ull, nullptr));
  TEST_ASSERT_TRUE(clk.isSynced());
  clk.beginSession();
  TEST_ASSERT_FALSE(clk.isSynced());
}

void test_stale_unsyncs() {
  ClockSync clk;
  clk.begin();
  TEST_ASSERT_TRUE(clk.addSample(0, 1000, 1'000'000ull, nullptr));
  TEST_ASSERT_TRUE(clk.isSynced());
  clk.service(1'000'000ull + static_cast<uint64_t>(SWARM_CLOCK_STALE_MS) * 1000ull + 1);
  TEST_ASSERT_FALSE(clk.isSynced());
}

void test_commit_lead_validation() {
  const char* reason = nullptr;
  TEST_ASSERT_FALSE(swarm::validateCommitLead(1000, 1000, &reason));
  TEST_ASSERT_FALSE(swarm::validateCommitLead(1000 + SWARM_COMMIT_MIN_LEAD_US - 1, 1000, &reason));
  TEST_ASSERT_TRUE(swarm::validateCommitLead(1000 + SWARM_COMMIT_MIN_LEAD_US, 1000, &reason));
  TEST_ASSERT_FALSE(swarm::validateCommitLead(1000 + SWARM_COMMIT_MAX_LEAD_US + 1, 1000, &reason));
}

void test_nine_nodes_shared_start_conversion() {
  // Nine nodes with different offsets/latencies convert the same coordinator start
  // into local times without catch-up (conversion only — no motor steps).
  ClockSync nodes[9];
  uint64_t coord = 10'000'000ull;
  for (int n = 0; n < 9; n++) {
    nodes[n].begin();
    const int64_t off = (n - 4) * 250'000ll;  // ±1s spread
    const uint64_t oneWay = 1000ull + static_cast<uint64_t>(n) * 200ull;
    for (uint32_t i = 0; i < 4; i++) {
      exchangeSample(nodes[n], off, oneWay, i + 1, &coord);
      coord += 10'000ull;
    }
    TEST_ASSERT_TRUE_MESSAGE(nodes[n].isSynced(), "node not synced");
  }

  const uint64_t startCoord = coord + 1'000'000ull;  // 1s lead
  int64_t minErr = INT64_MAX;
  int64_t maxErr = INT64_MIN;
  for (int n = 0; n < 9; n++) {
    const char* reason = nullptr;
    const uint64_t nowCoord = nodes[n].localToCoordinator(nodes[n].coordinatorToLocal(coord));
    // Use true coord for lead check
    TEST_ASSERT_TRUE(swarm::validateCommitLead(startCoord, coord, &reason));
    const uint64_t localStart = nodes[n].coordinatorToLocal(startCoord);
    // Ideal local = startCoord + trueOffset; error is offset estimation residual.
    const int64_t trueOff = (n - 4) * 250'000ll;
    const int64_t ideal = static_cast<int64_t>(startCoord) + trueOff;
    const int64_t err = static_cast<int64_t>(localStart) - ideal;
    if (err < minErr) {
      minErr = err;
    }
    if (err > maxErr) {
      maxErr = err;
    }
    (void)nowCoord;
  }
  // Simulated residual should stay well under the 20 ms gate for these clean samples.
  TEST_ASSERT_TRUE((maxErr - minErr) < 20'000);
  printf("sim nine-node start spread_us=%lld (NOT hardware)\n",
         static_cast<long long>(maxErr - minErr));
}

void test_asymmetric_delay_increases_uncertainty() {
  ClockSync clk;
  clk.begin();
  // Inject high RTT sample → uncertainty = RTT/2 may exceed 20ms gate.
  TEST_ASSERT_TRUE(clk.addSample(0, 50'000ull, 1000, nullptr));  // 50ms RTT → 25ms unc
  TEST_ASSERT_FALSE(clk.isSynced());
  clk.setUncertaintyMaxUs(30'000);
  clk.service(1000);
  // Re-add to recompute with new max
  TEST_ASSERT_TRUE(clk.addSample(0, 50'000ull, 2000, nullptr));
  TEST_ASSERT_TRUE(clk.isSynced());
}

void test_expired_commit_rejected() {
  const char* reason = nullptr;
  TEST_ASSERT_FALSE(swarm::validateCommitLead(5000, 6000, &reason));
  TEST_ASSERT_EQUAL_STRING("start_timestamp_expired", reason);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_symmetric_delay_converges);
  RUN_TEST(test_reject_large_rtt);
  RUN_TEST(test_session_invalidates);
  RUN_TEST(test_stale_unsyncs);
  RUN_TEST(test_commit_lead_validation);
  RUN_TEST(test_nine_nodes_shared_start_conversion);
  RUN_TEST(test_asymmetric_delay_increases_uncertainty);
  RUN_TEST(test_expired_commit_rejected);
  return UNITY_END();
}
