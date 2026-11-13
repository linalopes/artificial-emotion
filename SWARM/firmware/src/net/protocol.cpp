#include "protocol.h"

#include <WiFi.h>

#include <swarm_version.h>
#include "../util/log.h"
#include "../util/mono_time.h"
#include "../util/safe_string.h"
#include "../util/timing.h"

namespace swarm {
namespace {

ProtocolClient* gSelf = nullptr;

void wsThunk(WStype_t type, uint8_t* payload, size_t length) {
  if (gSelf) {
    gSelf->onWsEvent(type, payload, length);
  }
}

}  // namespace

void ProtocolClient::begin(const SwarmControllers& ctrls) {
  c_ = ctrls;
  gSelf = this;
  linked_ = false;
  socketStarted_ = false;
  mirrorSerialJson_ = false;
  idem_.clear();
}

bool ProtocolClient::commandRequiresIdempotency(const char* type) const {
  if (!type) {
    return false;
  }
  // Side-effecting commands must carry a unique message_id and be deduped.
  return strcmp(type, "home") == 0 || strcmp(type, "move_to_mm") == 0 ||
         strcmp(type, "load_preset") == 0 || strcmp(type, "load_trajectory") == 0 ||
         strcmp(type, "prepare_start") == 0 || strcmp(type, "prepare_run") == 0 ||
         strcmp(type, "start_at") == 0 || strcmp(type, "commit_run") == 0 ||
         strcmp(type, "cancel_run") == 0 || strcmp(type, "set_config") == 0 ||
         strcmp(type, "save_config") == 0 || strcmp(type, "clear_fault") == 0 ||
         strcmp(type, "ota_update") == 0 || strcmp(type, "stop") == 0 ||
         strcmp(type, "stop_all") == 0;
}

bool ProtocolClient::motionCritical() const {
  return c_.planner->isBusy() || c_.home->active() ||
         c_.state->state() == ModuleState::Moving || c_.state->state() == ModuleState::Homing ||
         c_.state->state() == ModuleState::Stopping;
}

bool ProtocolClient::parseBoundedJson(const char* data, size_t len, JsonDocument& doc) {
  if (!data || len == 0 || isMessageTooLarge(len)) {
    return false;
  }
  const DeserializationError err = deserializeJson(doc, data, len);
  return !err;
}

void ProtocolClient::ensureSocket() {
  if (!c_.wifi->isConnected() || !c_.config->isProvisioned()) {
    return;
  }
  const uint32_t now = millis();
  if (socketStarted_ && linked_) {
    return;
  }
  // L1: single reconnect owner — disable library auto-reconnect; we pace attempts here.
  if (socketStarted_ && elapsedMs(now, lastConnectAttemptMs_) < 5000) {
    return;
  }

  const auto& cfg = c_.config->get();
  ws_.disconnect();
  ws_.begin(cfg.coordinatorHost, cfg.coordinatorPort, "/swarm");
  ws_.onEvent(wsThunk);
  ws_.setReconnectInterval(0);
  socketStarted_ = true;
  lastConnectAttemptMs_ = now;
  SWARM_LOG("WS connecting to %s:%u/swarm", cfg.coordinatorHost, cfg.coordinatorPort);
}

void ProtocolClient::onWsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      linked_ = true;
      // M1: new coordinator session — drop prior message_id cache.
      idem_.beginSession();
      if (c_.clock) {
        c_.clock->beginSession();
      }
      if (c_.run) {
        c_.run->onDisconnectBeforeStart();
        // Fresh session: cancel any armed collective run.
      }
      SWARM_LOG("WS connected (idempotency session %lu)",
                static_cast<unsigned long>(idem_.session()));
      sendStatus(true);
      break;
    case WStype_DISCONNECTED:
      if (linked_) {
        linked_ = false;
        SWARM_LOG("WS disconnected");
        handleDisconnectPolicy();
      }
      socketStarted_ = false;  // allow ensureSocket to retry with backoff
      break;
    case WStype_TEXT: {
      if (isMessageTooLarge(length)) {
        SWARM_LOG("WS reject: message too large (%u)", static_cast<unsigned>(length));
        sendAck("oversized", false, "message too large");
        return;
      }
      JsonDocument doc;
      if (!parseBoundedJson(reinterpret_cast<const char*>(payload), length, doc)) {
        SWARM_LOG("WS JSON parse/reject");
        return;
      }
      handleMessage(doc);
      break;
    }
    default:
      break;
  }
}

void ProtocolClient::handleDisconnectPolicy() {
  const bool finish =
      c_.config->get().disconnectPolicy == DisconnectPolicy::FinishSegmentThenStop;

  if (c_.clock) {
    c_.clock->invalidate();
  }
  if (c_.run) {
    // Before start: cancel. During execution: apply segment policy via track.
    if (c_.run->phase() == RunPhase::Prepared || c_.run->phase() == RunPhase::Armed ||
        c_.run->phase() == RunPhase::Loaded) {
      c_.run->onDisconnectBeforeStart();
    }
  }

  // Never auto-resume choreography on later reconnect.
  c_.track->onCoordinatorDisconnected(finish);

  if (c_.home->active()) {
    c_.home->abortToUnhomed();
    SWARM_LOG("Disconnect: homing aborted to UNHOMED");
    return;
  }

  if (!c_.planner->isBusy()) {
    return;
  }

  if (finish) {
    SWARM_LOG("Disconnect: finishing current bounded motion, then hold");
    return;
  }

  c_.planner->requestControlledStop();
  c_.state->setStopping();
  SWARM_LOG("Disconnect: controlled stop");
}

bool ProtocolClient::targetMatches(const char* target) const {
  if (!target || target[0] == '\0') {
    return false;
  }
  if (strcmp(target, "broadcast") == 0 || strcmp(target, "*") == 0) {
    return true;
  }
  return strcmp(target, c_.config->get().moduleId) == 0;
}

void ProtocolClient::sendJson(const JsonDocument& doc) {
  char out[SWARM_JSON_DOC_CAPACITY];
  const size_t n = serializeJson(doc, out, sizeof(out));
  if (n == 0 || n >= sizeof(out)) {
    SWARM_LOG("status/json truncated or empty — not sent");
    return;
  }
  if (linked_) {
    ws_.sendTXT(out, n);
  }
  if (mirrorSerialJson_ && !motionCritical()) {
    Serial.print(">> ");
    Serial.println(out);
  }
}

void ProtocolClient::sendAck(const char* messageId, bool ok, const char* detail, bool remember) {
  JsonDocument doc;
  doc["protocol_version"] = SWARM_PROTOCOL_VERSION;
  doc["message_id"] = messageId ? messageId : "none";
  doc["source"] = c_.config->get().moduleId;
  doc["target"] = "swarm-controller";
  doc["type"] = ok ? "ack" : "nack";
  doc["timestamp_ms"] = millis();
  JsonObject payload = doc["payload"].to<JsonObject>();
  payload["ref"] = messageId ? messageId : "";
  payload["ok"] = ok;
  if (detail) {
    payload["detail"] = detail;
  }
  if (remember && messageId && messageId[0] != '\0') {
    idem_.remember(messageId, ok, detail);
  }
  sendJson(doc);
}

void ProtocolClient::sendEvent(const char* type, JsonObjectConst extraPayload) {
  JsonDocument doc;
  doc["protocol_version"] = SWARM_PROTOCOL_VERSION;
  doc["message_id"] = String("evt-") + String(static_cast<unsigned long>(millis()));
  doc["source"] = c_.config->get().moduleId;
  doc["target"] = "swarm-controller";
  doc["type"] = type;
  doc["timestamp_ms"] = millis();
  JsonObject payload = doc["payload"].to<JsonObject>();
  if (!extraPayload.isNull()) {
    for (JsonPairConst kv : extraPayload) {
      payload[kv.key().c_str()] = kv.value();
    }
  }
  sendJson(doc);
}

void ProtocolClient::fillStatus(JsonObject obj) const {
  obj["module_id"] = c_.config->get().moduleId;
  obj["firmware_version"] = SWARM_FW_VERSION;
  obj["protocol_version"] = SWARM_PROTOCOL_VERSION;
  obj["state"] = stateToString(c_.state->state());
  obj["fault"] = faultToString(c_.state->fault());
  obj["position_valid"] = c_.state->positionValid();
  if (c_.position->valid()) {
    obj["z_mm_est"] = c_.position->zMm(*c_.config);
  } else {
    obj["z_mm_est"] = nullptr;
  }
  obj["steps"] = c_.position->steps();
  obj["target_reached"] = c_.planner->targetReached();
  obj["stall"] = static_cast<uint8_t>(c_.planner->lastStall());
  obj["endstop_raw_closed"] = c_.endstop->rawClosed();
  obj["endstop_debounced_closed"] = c_.endstop->debouncedClosed();
  obj["wifi_connected"] = c_.wifi->isConnected();
  obj["ws_linked"] = linked_;
  obj["rssi"] = c_.wifi->rssi();
  obj["config_revision"] = c_.config->get().configRevision;
  obj["steps_per_mm"] = c_.config->stepsPerMm();
  obj["speed_rpm"] = c_.config->get().speedRpm;
  obj["max_travel_mm"] = c_.config->get().maxTravelMm;
  obj["track_phase"] = static_cast<uint8_t>(c_.track->phase());
  obj["preset_id"] = c_.track->presetId();
  obj["ota_phase"] = static_cast<uint8_t>(c_.ota->phase());
  obj["ota_progress"] = c_.ota->progressPercent();
  obj["uptime_ms"] = millis();
  obj["provisioned"] = c_.config->isProvisioned();

  // Clock sync telemetry (units documented in PROTOCOL.md).
  if (c_.clock) {
    const uint64_t nowUs = monoTimeUs();
    obj["clock_synced"] = c_.clock->isSynced();
    obj["clock_offset_us"] = c_.clock->offsetUs();
    obj["clock_rtt_us"] = c_.clock->rttUs();
    if (c_.clock->uncertaintyUs() == UINT64_MAX) {
      obj["clock_uncertainty_us"] = nullptr;
    } else {
      obj["clock_uncertainty_us"] = c_.clock->uncertaintyUs();
    }
    obj["last_sync_age_ms"] = c_.clock->lastSyncAgeMs(nowUs);
    obj["clock_uncertainty_max_us"] = c_.clock->uncertaintyMaxUs();
  }
  if (c_.run) {
    obj["run_phase"] = runPhaseToString(c_.run->phase());
    obj["run_id"] = c_.run->runId();
    obj["run_start_error_us"] = c_.run->startErrorUs();
  }
}

void ProtocolClient::sendStatus(bool force) {
  const uint32_t now = millis();
  if (!force && elapsedMs(now, lastStatusMs_) < SWARM_STATUS_MIN_INTERVAL_MS) {
    return;
  }
  // During motion, still heartbeat but never force Serial mirror.
  lastStatusMs_ = now;

  JsonDocument doc;
  doc["protocol_version"] = SWARM_PROTOCOL_VERSION;
  doc["message_id"] = now;
  doc["source"] = c_.config->get().moduleId;
  doc["target"] = "swarm-controller";
  doc["type"] = "status";
  doc["timestamp_ms"] = now;
  fillStatus(doc["payload"].to<JsonObject>());
  sendJson(doc);
}

bool ProtocolClient::applyConfigObject(JsonObjectConst obj, bool persist, String* error) {
  SwarmConfig next = c_.config->get();

  if (obj["module_id"].is<const char*>()) {
    // Identity changes only via Serial commissioning (H7/M8 hardening).
    if (error) {
      *error = "module_id change via set_config rejected; use Serial set_module_id";
    }
    return false;
  }
  if (obj["wifi_ssid"].is<const char*>()) {
    copyToFixed(next.wifiSsid, sizeof(next.wifiSsid), obj["wifi_ssid"]);
  }
  if (obj["wifi_password"].is<const char*>()) {
    copyToFixed(next.wifiPassword, sizeof(next.wifiPassword), obj["wifi_password"]);
  }
  if (obj["coordinator_host"].is<const char*>()) {
    copyToFixed(next.coordinatorHost, sizeof(next.coordinatorHost), obj["coordinator_host"]);
  }
  if (!obj["coordinator_port"].isNull()) {
    next.coordinatorPort = obj["coordinator_port"].as<uint16_t>();
  }
  if (obj["auth_token"].is<const char*>()) {
    copyToFixed(next.authToken, sizeof(next.authToken), obj["auth_token"]);
  }
  if (!obj["spool_diameter_mm"].isNull()) {
    next.spoolDiameterMm = obj["spool_diameter_mm"].as<float>();
  }
  if (!obj["steps_per_output_rev"].isNull()) {
    next.stepsPerOutputRev = obj["steps_per_output_rev"].as<uint32_t>();
  }
  if (!obj["calibration_factor"].isNull()) {
    next.calibrationFactor = obj["calibration_factor"].as<float>();
  }
  if (!obj["retract_direction"].isNull()) {
    next.retractDirection = obj["retract_direction"].as<int8_t>();
  }
  if (!obj["max_travel_mm"].isNull()) {
    next.maxTravelMm = obj["max_travel_mm"].as<float>();
  }
  if (!obj["speed_rpm"].isNull()) {
    next.speedRpm = obj["speed_rpm"].as<float>();
  }
  if (!obj["acceleration_mm_s2"].isNull()) {
    next.accelerationMmS2 = obj["acceleration_mm_s2"].as<float>();
  }
  if (!obj["home_seek_rpm"].isNull()) {
    next.homeSeekRpm = obj["home_seek_rpm"].as<float>();
  }
  if (!obj["home_backoff_rpm"].isNull()) {
    next.homeBackoffRpm = obj["home_backoff_rpm"].as<float>();
  }
  if (!obj["home_search_max_steps"].isNull()) {
    next.homeSearchMaxSteps = obj["home_search_max_steps"].as<uint32_t>();
  }
  if (!obj["home_timeout_ms"].isNull()) {
    next.homeTimeoutMs = obj["home_timeout_ms"].as<uint32_t>();
  }
  if (!obj["home_offset_mm"].isNull()) {
    next.homeOffsetMm = obj["home_offset_mm"].as<float>();
  }
  if (!obj["home_open_recovery_enabled"].isNull()) {
    next.homeOpenRecoveryEnabled = obj["home_open_recovery_enabled"].as<bool>();
  }
  if (!obj["home_recovery_max_steps"].isNull()) {
    next.homeRecoveryMaxSteps = obj["home_recovery_max_steps"].as<uint32_t>();
  }
  if (!obj["coil_hold_mode"].isNull()) {
    next.coilHoldMode = obj["coil_hold_mode"].as<uint8_t>() == 0 ? CoilHoldMode::Release
                                                                  : CoilHoldMode::Hold;
  }
  if (!obj["disconnect_policy"].isNull()) {
    next.disconnectPolicy = obj["disconnect_policy"].as<uint8_t>() == 0
                                ? DisconnectPolicy::FinishSegmentThenStop
                                : DisconnectPolicy::ControlledStop;
  }
  if (!obj["clock_uncertainty_max_us"].isNull() && c_.clock) {
    c_.clock->setUncertaintyMaxUs(obj["clock_uncertainty_max_us"].as<uint32_t>());
  }
  // hard_* ceilings are not remotely writable.
  if (!obj["hard_max_rpm"].isNull() || !obj["hard_max_accel_mm_s2"].isNull() ||
      !obj["hard_max_travel_mm"].isNull()) {
    if (error) {
      *error = "hard ceilings are not remotely configurable";
    }
    return false;
  }
  if (!obj["steps_per_mm"].isNull()) {
    if (error) {
      *error = "steps_per_mm is derived; set spool_diameter_mm, steps_per_output_rev, calibration_factor";
    }
    return false;
  }

  if (!c_.config->applyAndValidate(next, error)) {
    return false;
  }
  if (persist && !c_.config->save()) {
    if (error) {
      *error = "nvs save failed";
    }
    return false;
  }
  return true;
}

void ProtocolClient::operatorStop() {
  if (c_.run) {
    c_.run->cancel(c_.run->runId());
  }
  c_.track->stop();
  if (c_.home->active()) {
    c_.home->abortToUnhomed();
  } else {
    c_.planner->requestControlledStop();
    c_.state->setStopping();
  }
}

void ProtocolClient::handleMessage(JsonDocument& doc) {
  const int ver = doc["protocol_version"] | 0;
  if (ver != SWARM_PROTOCOL_VERSION) {
    sendAck(doc["message_id"] | "", false, "protocol_version mismatch", false);
    return;
  }

  const char* target = doc["target"] | "";
  if (!targetMatches(target)) {
    return;
  }

  const char* type = doc["type"] | "";
  const char* messageId = doc["message_id"] | "";
  JsonObjectConst payload = doc["payload"].as<JsonObjectConst>();
  String error;

  // M1: duplicate message_id within this WS session → replay ack, do not re-execute.
  if (messageId && messageId[0] != '\0') {
    bool prevOk = false;
    char prevDetail[IdempotencyCache::kDetailMax];
    if (idem_.lookup(messageId, &prevOk, prevDetail, sizeof(prevDetail))) {
      SWARM_LOG("idempotent replay ref=%s", messageId);
      sendAck(messageId, prevOk, prevDetail, false);
      if (strcmp(type, "get_status") == 0) {
        sendStatus(true);
      }
      return;
    }
  } else if (commandRequiresIdempotency(type)) {
    sendAck("", false, "message_id required", false);
    return;
  }

  auto requireAuth = [&]() -> bool {
    const char* token = payload["auth_token"] | "";
    // M2: never log token values.
    if (c_.config->get().authToken[0] == '\0') {
      error = "auth_token not configured";
      return false;
    }
    if (strcmp(token, c_.config->get().authToken) != 0) {
      error = "auth failed";
      return false;
    }
    return true;
  };

  if (strcmp(type, "get_status") == 0) {
    sendAck(messageId, true, "ok");
    sendStatus(true);
    return;
  }

  if (strcmp(type, "get_config") == 0) {
    JsonDocument out;
    out["protocol_version"] = SWARM_PROTOCOL_VERSION;
    out["message_id"] = millis();
    out["source"] = c_.config->get().moduleId;
    out["target"] = "swarm-controller";
    out["type"] = "config";
    out["timestamp_ms"] = millis();
    JsonObject p = out["payload"].to<JsonObject>();
    const auto& cfg = c_.config->get();
    p["module_id"] = cfg.moduleId;
    p["spool_diameter_mm"] = cfg.spoolDiameterMm;
    p["steps_per_output_rev"] = cfg.stepsPerOutputRev;
    p["calibration_factor"] = cfg.calibrationFactor;
    p["steps_per_mm"] = c_.config->stepsPerMm();
    p["retract_direction"] = cfg.retractDirection;
    p["max_travel_mm"] = cfg.maxTravelMm;
    p["speed_rpm"] = cfg.speedRpm;
    p["acceleration_mm_s2"] = cfg.accelerationMmS2;
    p["home_seek_rpm"] = cfg.homeSeekRpm;
    p["home_backoff_rpm"] = cfg.homeBackoffRpm;
    p["home_search_max_steps"] = cfg.homeSearchMaxSteps;
    p["home_timeout_ms"] = cfg.homeTimeoutMs;
    p["home_offset_mm"] = cfg.homeOffsetMm;
    p["home_open_recovery_enabled"] = cfg.homeOpenRecoveryEnabled;
    p["home_recovery_max_steps"] = cfg.homeRecoveryMaxSteps;
    p["coil_hold_mode"] = static_cast<uint8_t>(cfg.coilHoldMode);
    p["disconnect_policy"] = static_cast<uint8_t>(cfg.disconnectPolicy);
    p["coordinator_host"] = cfg.coordinatorHost;
    p["coordinator_port"] = cfg.coordinatorPort;
    p["config_revision"] = cfg.configRevision;
    p["hard_max_rpm"] = cfg.hardMaxRpm;
    p["hard_max_travel_mm"] = cfg.hardMaxTravelMm;
    p["abs_max_rpm"] = SWARM_ABS_MAX_RPM;
    p["abs_max_travel_mm"] = SWARM_ABS_MAX_TRAVEL_MM;
    sendAck(messageId, true, "ok");
    sendJson(out);
    return;
  }

  if (strcmp(type, "set_config") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    if (!c_.state->isIdleForConfig() || c_.planner->isBusy() || c_.home->active()) {
      sendAck(messageId, false, "busy");
      return;
    }
    const bool persist = payload["save"] | false;
    if (!applyConfigObject(payload, persist, &error)) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    sendAck(messageId, true, persist ? "applied+saved" : "applied");
    sendStatus(true);
    return;
  }

  if (strcmp(type, "save_config") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    if (!c_.config->save()) {
      sendAck(messageId, false, "save failed");
      return;
    }
    sendAck(messageId, true, "saved");
    return;
  }

  if (strcmp(type, "home") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    if (!c_.home->start(&error)) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    sendAck(messageId, true, "homing started");
    sendStatus(true);
    return;
  }

  if (strcmp(type, "move_to_mm") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    if (!linked_) {
      sendAck(messageId, false, "not linked");
      return;
    }
    if (!c_.state->canMoveAbsolute()) {
      sendAck(messageId, false, "not ready/homed");
      return;
    }
    if (c_.home->active() || c_.track->phase() == TrackPhase::Playing ||
        c_.track->phase() == TrackPhase::SegmentActive ||
        c_.track->phase() == TrackPhase::Armed) {
      sendAck(messageId, false, "busy with home/track");
      return;
    }
    const float z = payload["position_mm"] | -1.0f;
    float rpm = payload["speed_rpm"] | c_.config->get().speedRpm;
    float accel = payload["acceleration_mm_s2"] | c_.config->get().accelerationMmS2;
    rpm = constrain(rpm, 0.1f, c_.config->get().hardMaxRpm);
    accel = constrain(accel, 0.1f, c_.config->get().hardMaxAccelMmS2);
    const int32_t steps = c_.config->mmToSteps(z);
    if (!c_.planner->moveToSteps(steps, rpm, accel, &error)) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    c_.state->setMoving();
    sendAck(messageId, true, "moving");
    sendStatus(true);
    return;
  }

  if (strcmp(type, "stop") == 0 || strcmp(type, "stop_all") == 0) {
    // Stop is prioritized and does not require auth (local safety).
    operatorStop();
    sendAck(messageId, true, "stopping");
    sendStatus(true);
    return;
  }

  if (strcmp(type, "clear_fault") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    c_.state->clearFault();
    c_.planner->clearStall();
    c_.planner->clearUnexpectedEndstop();
    sendAck(messageId, true, "fault cleared; re-home required");
    sendStatus(true);
    return;
  }

  if (strcmp(type, "load_preset") == 0 || strcmp(type, "load_trajectory") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    const char* presetId = payload["preset_id"] | "unnamed";
    const char* runId = payload["run_id"] | "";
    const uint32_t revision = payload["revision"] | 1;
    JsonArrayConst track = payload["track"].as<JsonArrayConst>();
    if (track.isNull()) {
      JsonObjectConst tracks = payload["tracks"].as<JsonObjectConst>();
      if (!tracks.isNull()) {
        track = tracks[c_.config->get().moduleId].as<JsonArrayConst>();
      }
    }
    if (track.isNull()) {
      sendAck(messageId, false, "missing track for module");
      return;
    }
    TrackKeyframe frames[kMaxTrackKeyframes];
    size_t n = 0;
    for (JsonVariantConst v : track) {
      if (n >= kMaxTrackKeyframes) {
        sendAck(messageId, false, "too many keyframes");
        return;
      }
      frames[n].timeMs = v["time_ms"] | 0;
      frames[n].zMm = v["z_mm"] | 0.0f;
      n++;
    }
    if (c_.run && runId[0] != '\0') {
      if (!c_.run->loadRun(runId, presetId, revision, frames, n, &error)) {
        sendAck(messageId, false, error.c_str());
        return;
      }
    } else if (!c_.track->load(presetId, revision, frames, n, &error)) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    sendAck(messageId, true, "trajectory loaded");
    return;
  }

  if (strcmp(type, "prepare_start") == 0) {
    // Legacy unsynchronized prepare (no clock gate). Prefer prepare_run for collective.
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    if (!c_.track->prepareStart(&error)) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    sendAck(messageId, true, "ready_for_start");
    return;
  }

  if (strcmp(type, "prepare_run") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    if (!c_.run) {
      sendAck(messageId, false, "run controller unavailable");
      return;
    }
    const char* runId = payload["run_id"] | "";
    if (runId[0] == '\0') {
      sendAck(messageId, false, "run_id required");
      return;
    }
    if (c_.run->phase() == RunPhase::Idle || c_.run->runId()[0] == '\0') {
      if (!c_.run->bindLoadedTrack(runId, &error)) {
        sendAck(messageId, false, error.c_str());
        return;
      }
    }
    if (!c_.run->prepare(runId, c_.state->positionValid(),
                         c_.state->state() == ModuleState::Ready, c_.state->state() == ModuleState::Fault,
                         c_.ota->active(), c_.planner->isBusy(), c_.home->active(), &error)) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    sendAck(messageId, true, "ready_for_commit");
    return;
  }

  if (strcmp(type, "start_at") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    // LEGACY unsynchronized relative start — not for collective choreography.
    long delayMsLong = 500;
    if (!payload["delay_ms"].isNull()) {
      if (!(payload["delay_ms"].is<int>() || payload["delay_ms"].is<long>() ||
            payload["delay_ms"].is<unsigned int>() || payload["delay_ms"].is<unsigned long>())) {
        sendAck(messageId, false, "delay_ms must be an integer");
        return;
      }
      delayMsLong = payload["delay_ms"].as<long>();
    }
    if (const char* delayErr =
            validateStartAtDelayMs(delayMsLong, SWARM_START_AT_MAX_DELAY_MS)) {
      sendAck(messageId, false, delayErr);
      return;
    }
    const uint32_t delayMs = static_cast<uint32_t>(delayMsLong);
    const uint32_t now = millis();
    if (!c_.track->startAt(now + delayMs, &error)) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    sendAck(messageId, true, "armed_start_unsynchronized");
    return;
  }

  if (strcmp(type, "commit_run") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    if (!c_.run || !c_.clock) {
      sendAck(messageId, false, "sync/run unavailable");
      return;
    }
    const char* runId = payload["run_id"] | "";
    // Coordinator absolute monotonic microseconds.
    if (payload["start_at_us"].isNull()) {
      sendAck(messageId, false, "start_at_us required");
      return;
    }
    const uint64_t startAtUs = payload["start_at_us"].as<uint64_t>();
    if (!c_.run->commit(runId, startAtUs, monoTimeUs(), &error)) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    sendAck(messageId, true, "run_armed");
    {
      JsonDocument ev;
      JsonObject p = ev["payload"].to<JsonObject>();
      p["run_id"] = runId;
      p["start_at_us"] = startAtUs;
      p["start_local_us"] = c_.run->startLocalUs();
      sendEvent("run_armed", ev["payload"].as<JsonObjectConst>());
    }
    return;
  }

  if (strcmp(type, "cancel_run") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    const char* runId = payload["run_id"] | "";
    if (c_.run) {
      c_.run->cancel(runId);
    }
    c_.track->stop();
    sendAck(messageId, true, "run_cancelled");
    return;
  }

  if (strcmp(type, "clock_sync_req") == 0) {
    // No auth required for sync probes (timing-sensitive); session must be linked.
    if (!c_.clock) {
      sendAck(messageId, false, "clock unavailable");
      return;
    }
    if (payload["t1_us"].isNull()) {
      sendAck(messageId, false, "t1_us required");
      return;
    }
    const uint64_t t1 = payload["t1_us"].as<uint64_t>();
    const uint32_t seq = payload["sync_seq"] | 0;
    uint64_t t2 = 0;
    uint64_t t3 = 0;
    const uint64_t now = monoTimeUs();
    c_.clock->onSyncReq(t1, seq, now, &t2, &t3);
    t3 = monoTimeUs();
    JsonDocument resp;
    resp["protocol_version"] = SWARM_PROTOCOL_VERSION;
    resp["message_id"] = String("sync-") + String(seq);
    resp["source"] = c_.config->get().moduleId;
    resp["target"] = "swarm-controller";
    resp["type"] = "clock_sync_resp";
    resp["timestamp_ms"] = millis();
    JsonObject p = resp["payload"].to<JsonObject>();
    p["sync_seq"] = seq;
    p["t1_us"] = t1;
    p["t2_us"] = t2;
    p["t3_us"] = t3;
    p["ref"] = messageId;
    sendJson(resp);
    sendAck(messageId, true, "sync_resp_sent", false);
    return;
  }

  if (strcmp(type, "clock_sync_fin") == 0) {
    if (!c_.clock) {
      sendAck(messageId, false, "clock unavailable");
      return;
    }
    const uint64_t t1 = payload["t1_us"] | 0;
    const uint64_t t2 = payload["t2_us"] | 0;
    const uint64_t t3 = payload["t3_us"] | 0;
    const uint64_t t4 = payload["t4_us"] | 0;
    const uint32_t seq = payload["sync_seq"] | 0;
    const char* reason = nullptr;
    if (!c_.clock->onSyncFin(t1, t2, t3, t4, seq, monoTimeUs(), &reason)) {
      sendAck(messageId, false, reason ? reason : "sync rejected");
      return;
    }
    sendAck(messageId, true, c_.clock->isSynced() ? "clock_synced" : "clock_sample_accepted");
    sendStatus(true);
    return;
  }

  if (strcmp(type, "ota_update") == 0) {
    if (!requireAuth()) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    if (c_.planner->isBusy() || c_.home->active() || motionCritical()) {
      sendAck(messageId, false, "cannot ota while moving/homing");
      return;
    }
    const char* url = payload["url"] | "";
    const char* token = payload["auth_token"] | "";
    if (!c_.ota->startHttpUpdate(url, token, &error)) {
      sendAck(messageId, false, error.c_str());
      return;
    }
    sendAck(messageId, true, "ota started");
    return;
  }

  sendAck(messageId, false, "unknown type");
}

void ProtocolClient::service() {
  ensureSocket();
  if (socketStarted_) {
    ws_.loop();
  }

  const uint64_t nowUs = monoTimeUs();
  if (c_.clock) {
    c_.clock->service(nowUs);
  }
  if (c_.run) {
    const bool syncOk = c_.clock && c_.clock->isSynced();
    if (c_.run->service(nowUs, syncOk)) {
      JsonDocument ev;
      JsonObject p = ev["payload"].to<JsonObject>();
      p["run_id"] = c_.run->runId();
      p["start_error_us"] = c_.run->startErrorUs();
      sendEvent("run_started", ev["payload"].as<JsonObjectConst>());
    }
    if (c_.run->phase() == RunPhase::Completed) {
      JsonDocument ev;
      JsonObject p = ev["payload"].to<JsonObject>();
      p["run_id"] = c_.run->runId();
      sendEvent("run_completed", ev["payload"].as<JsonObjectConst>());
      c_.run->reset();
    } else if (c_.run->phase() == RunPhase::Failed) {
      JsonDocument ev;
      JsonObject p = ev["payload"].to<JsonObject>();
      p["run_id"] = c_.run->runId();
      p["detail"] = c_.run->lastReject();
      sendEvent("run_failed", ev["payload"].as<JsonObjectConst>());
      c_.run->reset();
    }
    if (c_.state->state() == ModuleState::Fault) {
      c_.run->markFault();
    }
  }

  // Stall incomplete: report accurately — do not claim target reached.
  if (c_.planner->lastStall() == StallOutcome::IncompleteStop) {
    if (c_.state->state() == ModuleState::Moving || c_.state->state() == ModuleState::Stopping) {
      if (c_.state->positionValid()) {
        c_.state->setReady();
      } else {
        c_.state->setUnhomed();
      }
    }
    sendStatus(true);
    c_.planner->clearStall();
  } else if (c_.planner->lastStall() == StallOutcome::PositionInvalid) {
    if (!c_.home->active()) {
      c_.state->enterFault(FaultCode::MotionRejected);
    }
    c_.planner->clearStall();
  }

  if (c_.state->state() == ModuleState::Stopping && !c_.planner->isBusy()) {
    c_.planner->applyRestPolicy();
    if (c_.state->positionValid()) {
      c_.state->setReady();
    } else if (c_.state->state() != ModuleState::Fault) {
      c_.state->setUnhomed();
    }
  }

  if (c_.state->state() == ModuleState::Moving && !c_.planner->isBusy() &&
      c_.track->phase() != TrackPhase::SegmentActive &&
      c_.track->phase() != TrackPhase::Playing) {
    if (c_.planner->hitUnexpectedEndstop()) {
      c_.planner->clearUnexpectedEndstop();
      c_.state->enterFault(FaultCode::UnexpectedEndstopOpen);
    } else if (c_.state->positionValid()) {
      c_.state->setReady();
    }
  }

  sendStatus(false);
}

void ProtocolClient::handleSerialLine(const String& line) {
  if (line.length() > SWARM_MAX_SERIAL_LINE_BYTES) {
    SWARM_LOG("serial line too long");
    return;
  }
  String s = line;
  s.trim();
  if (s.length() == 0) {
    return;
  }

  if (s == "?" || s == "help") {
    Serial.println(F("Serial: status | home | stop | clear_fault | mirror on|off"));
    Serial.println(F("  set_module_id Mau01"));
    Serial.println(F("  set_wifi <ssid> <password>"));
    Serial.println(F("  set_coordinator <host> <port>"));
    Serial.println(F("  set_token <token>"));
    Serial.println(F("  save_config | move_to_mm <mm> | json <raw>"));
    return;
  }
  if (s == "mirror on") {
    mirrorSerialJson_ = true;
    return;
  }
  if (s == "mirror off") {
    mirrorSerialJson_ = false;
    return;
  }
  if (s == "status") {
    const bool prev = mirrorSerialJson_;
    mirrorSerialJson_ = true;
    sendStatus(true);
    mirrorSerialJson_ = prev;
    return;
  }
  if (s == "home") {
    String err;
    if (!c_.home->start(&err)) {
      SWARM_LOG("home failed: %s", err.c_str());
    }
    return;
  }
  if (s == "stop") {
    operatorStop();
    return;
  }
  if (s == "clear_fault") {
    c_.state->clearFault();
    c_.planner->clearStall();
    return;
  }
  if (s == "save_config") {
    c_.config->save();
    return;
  }
  if (s.startsWith("set_module_id ")) {
    SwarmConfig next = c_.config->get();
    String id = s.substring(14);
    id.trim();
    copyToFixed(next.moduleId, sizeof(next.moduleId), id.c_str());
    String err;
    if (!c_.config->applyAndValidate(next, &err) || !c_.config->save()) {
      SWARM_LOG("set_module_id failed: %s", err.c_str());
    } else {
      SWARM_LOG("module_id=%s saved", next.moduleId);
    }
    return;
  }
  if (s.startsWith("set_wifi ")) {
    SwarmConfig next = c_.config->get();
    const int sp = s.indexOf(' ', 9);
    if (sp < 0) {
      SWARM_LOG("usage: set_wifi <ssid> <password>");
      return;
    }
    copyToFixed(next.wifiSsid, sizeof(next.wifiSsid), s.substring(9, sp).c_str());
    copyToFixed(next.wifiPassword, sizeof(next.wifiPassword), s.substring(sp + 1).c_str());
    String err;
    if (!c_.config->applyAndValidate(next, &err) || !c_.config->save()) {
      SWARM_LOG("set_wifi failed: %s", err.c_str());
    } else {
      c_.wifi->requestReconnect();
    }
    return;
  }
  if (s.startsWith("set_coordinator ")) {
    SwarmConfig next = c_.config->get();
    const int sp = s.indexOf(' ', 16);
    if (sp < 0) {
      SWARM_LOG("usage: set_coordinator <host> <port>");
      return;
    }
    copyToFixed(next.coordinatorHost, sizeof(next.coordinatorHost), s.substring(16, sp).c_str());
    next.coordinatorPort = static_cast<uint16_t>(s.substring(sp + 1).toInt());
    String err;
    if (!c_.config->applyAndValidate(next, &err) || !c_.config->save()) {
      SWARM_LOG("set_coordinator failed: %s", err.c_str());
    } else {
      socketStarted_ = false;
    }
    return;
  }
  if (s.startsWith("set_token ")) {
    SwarmConfig next = c_.config->get();
    String tok = s.substring(10);
    tok.trim();
    copyToFixed(next.authToken, sizeof(next.authToken), tok.c_str());
    String err;
    if (!c_.config->applyAndValidate(next, &err) || !c_.config->save()) {
      SWARM_LOG("set_token failed: %s", err.c_str());
    }
    return;
  }
  if (s.startsWith("move_to_mm ")) {
    if (!c_.state->canMoveAbsolute()) {
      SWARM_LOG("move rejected: not ready");
      return;
    }
    const float z = s.substring(11).toFloat();
    String err;
    if (!c_.planner->moveToSteps(c_.config->mmToSteps(z), c_.config->get().speedRpm,
                                 c_.config->get().accelerationMmS2, &err)) {
      SWARM_LOG("move failed: %s", err.c_str());
      return;
    }
    c_.state->setMoving();
    return;
  }
  if (s.startsWith("json ")) {
    const String body = s.substring(5);
    if (isMessageTooLarge(body.length())) {
      SWARM_LOG("json too large");
      return;
    }
    JsonDocument doc;
    if (!parseBoundedJson(body.c_str(), body.length(), doc)) {
      SWARM_LOG("bad json");
      return;
    }
    handleMessage(doc);
    return;
  }

  SWARM_LOG("unknown serial command (help)");
}

}  // namespace swarm
