#include "config_store.h"

#include <Preferences.h>
#include <math.h>

#include "config_rules.h"
#include "../util/log.h"
#include "../util/safe_string.h"

namespace swarm {
namespace {

Preferences prefs;

}  // namespace

void ConfigStore::clampHardCeilings(SwarmConfig& c) {
  rules::HardCeilings hc{c.hardMaxRpm, c.hardMaxAccelMmS2, c.hardMaxTravelMm};
  rules::clampHardCeilings(hc);
  c.hardMaxRpm = hc.hardMaxRpm;
  c.hardMaxAccelMmS2 = hc.hardMaxAccelMmS2;
  c.hardMaxTravelMm = hc.hardMaxTravelMm;
  if (c.maxTravelMm > c.hardMaxTravelMm) {
    c.maxTravelMm = c.hardMaxTravelMm;
  }
  if (c.speedRpm > c.hardMaxRpm) {
    c.speedRpm = c.hardMaxRpm;
  }
  if (c.accelerationMmS2 > c.hardMaxAccelMmS2) {
    c.accelerationMmS2 = c.hardMaxAccelMmS2;
  }
  if (c.homeSeekRpm > c.hardMaxRpm) {
    c.homeSeekRpm = c.hardMaxRpm;
  }
  if (c.homeBackoffRpm > c.hardMaxRpm) {
    c.homeBackoffRpm = c.hardMaxRpm;
  }
}

bool ConfigStore::validateConfig(const SwarmConfig& c, String* error) {
  auto fail = [&](const char* msg) {
    if (error) {
      *error = msg;
    }
    return false;
  };

  if (!rules::isValidModuleId(c.moduleId)) {
    return fail("invalid module_id");
  }
  if (const char* hardErr =
          rules::checkHardCeilingsLegal(c.hardMaxRpm, c.hardMaxAccelMmS2, c.hardMaxTravelMm)) {
    return fail(hardErr);
  }
  if (c.spoolDiameterMm < 5.0f || c.spoolDiameterMm > 40.0f) {
    return fail("spool_diameter_mm out of range");
  }
  if (c.stepsPerOutputRev < 512 || c.stepsPerOutputRev > 8192) {
    return fail("steps_per_output_rev out of range");
  }
  if (c.calibrationFactor < 0.5f || c.calibrationFactor > 2.0f) {
    return fail("calibration_factor out of range");
  }
  if (c.retractDirection != -1 && c.retractDirection != 1) {
    return fail("retract_direction must be -1 or 1");
  }
  if (c.maxTravelMm <= 0.0f || c.maxTravelMm > c.hardMaxTravelMm) {
    return fail("max_travel_mm out of range");
  }
  if (c.speedRpm <= 0.0f || c.speedRpm > c.hardMaxRpm) {
    return fail("speed_rpm out of range");
  }
  if (c.accelerationMmS2 <= 0.0f || c.accelerationMmS2 > c.hardMaxAccelMmS2) {
    return fail("acceleration_mm_s2 out of range");
  }
  if (c.homeSeekRpm <= 0.0f || c.homeSeekRpm > c.hardMaxRpm) {
    return fail("home_seek_rpm out of range");
  }
  if (c.homeBackoffRpm <= 0.0f || c.homeBackoffRpm > c.hardMaxRpm) {
    return fail("home_backoff_rpm out of range");
  }
  if (c.homeSearchMaxSteps < 100 || c.homeSearchMaxSteps > SWARM_ABS_MAX_HOME_SEARCH_STEPS) {
    return fail("home_search_max_steps out of range");
  }
  if (c.homeTimeoutMs < 1000 || c.homeTimeoutMs > SWARM_ABS_MAX_HOME_TIMEOUT_MS) {
    return fail("home_timeout_ms out of range");
  }
  if (c.homeOffsetMm < 0.0f || c.homeOffsetMm > 50.0f) {
    return fail("home_offset_mm out of range");
  }
  if (c.homeRecoveryMaxSteps < 10 ||
      c.homeRecoveryMaxSteps > SWARM_ABS_MAX_HOME_RECOVERY_STEPS) {
    return fail("home_recovery_max_steps out of range");
  }
  if (c.coordinatorPort == 0) {
    return fail("coordinator_port invalid");
  }
  if (c.coordinatorHost[0] == '\0') {
    return fail("coordinator_host empty");
  }
  // After provisioning, auth token must be non-empty (empty disables auth — rejected).
  if (strcmp(c.moduleId, "UNPROV") != 0 && c.authToken[0] == '\0') {
    return fail("auth_token required when provisioned");
  }
  return true;
}

bool ConfigStore::begin() {
  loadDefaults();
  if (!prefs.begin("swarm", true)) {
    SWARM_LOG("NVS open failed; using defaults");
    clampHardCeilings(cfg_);
    return false;
  }

  prefs.getString("module_id", cfg_.moduleId, sizeof(cfg_.moduleId));
  cfg_.moduleId[sizeof(cfg_.moduleId) - 1] = '\0';
  prefs.getString("wifi_ssid", cfg_.wifiSsid, sizeof(cfg_.wifiSsid));
  cfg_.wifiSsid[sizeof(cfg_.wifiSsid) - 1] = '\0';
  prefs.getString("wifi_pass", cfg_.wifiPassword, sizeof(cfg_.wifiPassword));
  cfg_.wifiPassword[sizeof(cfg_.wifiPassword) - 1] = '\0';
  prefs.getString("coord_host", cfg_.coordinatorHost, sizeof(cfg_.coordinatorHost));
  cfg_.coordinatorHost[sizeof(cfg_.coordinatorHost) - 1] = '\0';
  cfg_.coordinatorPort = prefs.getUShort("coord_port", cfg_.coordinatorPort);
  prefs.getString("auth_token", cfg_.authToken, sizeof(cfg_.authToken));
  cfg_.authToken[sizeof(cfg_.authToken) - 1] = '\0';

  cfg_.spoolDiameterMm = prefs.getFloat("spool_d_mm", cfg_.spoolDiameterMm);
  cfg_.stepsPerOutputRev = prefs.getUInt("steps_rev", cfg_.stepsPerOutputRev);
  cfg_.calibrationFactor = prefs.getFloat("cal_factor", cfg_.calibrationFactor);
  cfg_.retractDirection = static_cast<int8_t>(prefs.getInt("retract_dir", cfg_.retractDirection));
  cfg_.maxTravelMm = prefs.getFloat("max_travel", cfg_.maxTravelMm);
  cfg_.speedRpm = prefs.getFloat("speed_rpm", cfg_.speedRpm);
  cfg_.accelerationMmS2 = prefs.getFloat("accel_mms2", cfg_.accelerationMmS2);
  cfg_.homeSeekRpm = prefs.getFloat("home_seek", cfg_.homeSeekRpm);
  cfg_.homeBackoffRpm = prefs.getFloat("home_back", cfg_.homeBackoffRpm);
  cfg_.homeSearchMaxSteps = prefs.getUInt("home_max_s", cfg_.homeSearchMaxSteps);
  cfg_.homeTimeoutMs = prefs.getUInt("home_tmo", cfg_.homeTimeoutMs);
  cfg_.homeOffsetMm = prefs.getFloat("home_off", cfg_.homeOffsetMm);
  cfg_.homeOpenRecoveryEnabled = prefs.getBool("home_recov", cfg_.homeOpenRecoveryEnabled);
  cfg_.homeRecoveryMaxSteps = prefs.getUInt("home_rec_s", cfg_.homeRecoveryMaxSteps);
  cfg_.coilHoldMode =
      static_cast<CoilHoldMode>(prefs.getUChar("coil_hold", static_cast<uint8_t>(cfg_.coilHoldMode)));
  cfg_.disconnectPolicy = static_cast<DisconnectPolicy>(
      prefs.getUChar("disc_pol", static_cast<uint8_t>(cfg_.disconnectPolicy)));
  cfg_.hardMaxRpm = prefs.getFloat("hard_rpm", cfg_.hardMaxRpm);
  cfg_.hardMaxAccelMmS2 = prefs.getFloat("hard_acc", cfg_.hardMaxAccelMmS2);
  cfg_.hardMaxTravelMm = prefs.getFloat("hard_trav", cfg_.hardMaxTravelMm);
  cfg_.configRevision = prefs.getUInt("cfg_rev", 0);
  prefs.end();

  // Always clamp ceilings first so corruption cannot raise limits.
  clampHardCeilings(cfg_);

  String err;
  if (!validateConfig(cfg_, &err)) {
    SWARM_LOG("Loaded config invalid (%s); resetting motion fields to defaults", err.c_str());
    const SwarmConfig safe = cfg_;
    loadDefaults();
    copyToFixed(cfg_.moduleId, sizeof(cfg_.moduleId), safe.moduleId);
    copyToFixed(cfg_.wifiSsid, sizeof(cfg_.wifiSsid), safe.wifiSsid);
    copyToFixed(cfg_.wifiPassword, sizeof(cfg_.wifiPassword), safe.wifiPassword);
    copyToFixed(cfg_.coordinatorHost, sizeof(cfg_.coordinatorHost), safe.coordinatorHost);
    cfg_.coordinatorPort = safe.coordinatorPort;
    copyToFixed(cfg_.authToken, sizeof(cfg_.authToken), safe.authToken);
    clampHardCeilings(cfg_);
    // If identity/auth still invalid after recovery, force UNPROV.
    if (!validateConfig(cfg_, &err)) {
      SWARM_LOG("Identity/network still invalid (%s); UNPROV", err.c_str());
      loadDefaults();
      clampHardCeilings(cfg_);
    }
  }

  SWARM_LOG("Config loaded id=%s steps/mm=%.3f rev=%lu hardRpm=%.1f", cfg_.moduleId, stepsPerMm(),
            static_cast<unsigned long>(cfg_.configRevision), cfg_.hardMaxRpm);
  return true;
}

void ConfigStore::loadDefaults() { cfg_ = SwarmConfig{}; }

bool ConfigStore::isProvisioned() const {
  return rules::isValidModuleId(cfg_.moduleId) && strcmp(cfg_.moduleId, "UNPROV") != 0;
}

bool ConfigStore::applyAndValidate(const SwarmConfig& incoming, String* error) {
  SwarmConfig next = incoming;
  clampHardCeilings(next);
  if (!validateConfig(next, error)) {
    return false;
  }
  cfg_ = next;
  return true;
}

bool ConfigStore::save() {
  clampHardCeilings(cfg_);
  String err;
  if (!validateConfig(cfg_, &err)) {
    SWARM_LOG("Refusing to save invalid config: %s", err.c_str());
    return false;
  }
  if (!prefs.begin("swarm", false)) {
    return false;
  }
  cfg_.configRevision++;
  prefs.putString("module_id", cfg_.moduleId);
  prefs.putString("wifi_ssid", cfg_.wifiSsid);
  prefs.putString("wifi_pass", cfg_.wifiPassword);
  prefs.putString("coord_host", cfg_.coordinatorHost);
  prefs.putUShort("coord_port", cfg_.coordinatorPort);
  prefs.putString("auth_token", cfg_.authToken);
  prefs.putFloat("spool_d_mm", cfg_.spoolDiameterMm);
  prefs.putUInt("steps_rev", cfg_.stepsPerOutputRev);
  prefs.putFloat("cal_factor", cfg_.calibrationFactor);
  prefs.putInt("retract_dir", cfg_.retractDirection);
  prefs.putFloat("max_travel", cfg_.maxTravelMm);
  prefs.putFloat("speed_rpm", cfg_.speedRpm);
  prefs.putFloat("accel_mms2", cfg_.accelerationMmS2);
  prefs.putFloat("home_seek", cfg_.homeSeekRpm);
  prefs.putFloat("home_back", cfg_.homeBackoffRpm);
  prefs.putUInt("home_max_s", cfg_.homeSearchMaxSteps);
  prefs.putUInt("home_tmo", cfg_.homeTimeoutMs);
  prefs.putFloat("home_off", cfg_.homeOffsetMm);
  prefs.putBool("home_recov", cfg_.homeOpenRecoveryEnabled);
  prefs.putUInt("home_rec_s", cfg_.homeRecoveryMaxSteps);
  prefs.putUChar("coil_hold", static_cast<uint8_t>(cfg_.coilHoldMode));
  prefs.putUChar("disc_pol", static_cast<uint8_t>(cfg_.disconnectPolicy));
  prefs.putFloat("hard_rpm", cfg_.hardMaxRpm);
  prefs.putFloat("hard_acc", cfg_.hardMaxAccelMmS2);
  prefs.putFloat("hard_trav", cfg_.hardMaxTravelMm);
  prefs.putUInt("cfg_rev", cfg_.configRevision);
  prefs.end();
  SWARM_LOG("Config saved rev=%lu", static_cast<unsigned long>(cfg_.configRevision));
  return true;
}

float ConfigStore::stepsPerMm() const {
  const float travelPerRev = static_cast<float>(M_PI) * cfg_.spoolDiameterMm;
  if (travelPerRev <= 0.0f) {
    return 0.0f;
  }
  return (static_cast<float>(cfg_.stepsPerOutputRev) / travelPerRev) * cfg_.calibrationFactor;
}

int32_t ConfigStore::mmToSteps(float mm) const {
  return static_cast<int32_t>(lroundf(mm * stepsPerMm()));
}

float ConfigStore::stepsToMm(int32_t steps) const {
  const float spm = stepsPerMm();
  if (spm <= 0.0f) {
    return 0.0f;
  }
  return static_cast<float>(steps) / spm;
}

float ConfigStore::rpmToStepsPerSec(float rpm) const {
  return (rpm * static_cast<float>(cfg_.stepsPerOutputRev)) / 60.0f;
}

float ConfigStore::mmS2ToStepsS2(float mmS2) const {
  return mmS2 * stepsPerMm();
}

}  // namespace swarm
