#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

#include <swarm_limits.h>

#include "../choreography/run_controller.h"
#include "../choreography/track_player.h"
#include "../config/config_store.h"
#include "../homing/home_controller.h"
#include "../motor/motion_planner.h"
#include "../ota/ota_service.h"
#include "../position/position.h"
#include "../sensing/endstop.h"
#include "../sync/clock_sync.h"
#include "../system/module_state.h"
#include "idempotency.h"
#include "wifi_manager.h"

namespace swarm {

struct SwarmControllers {
  ConfigStore* config = nullptr;
  ModuleStateMachine* state = nullptr;
  PositionModel* position = nullptr;
  Endstop* endstop = nullptr;
  MotionPlanner* planner = nullptr;
  HomeController* home = nullptr;
  WifiManager* wifi = nullptr;
  TrackPlayer* track = nullptr;
  OtaService* ota = nullptr;
  ClockSync* clock = nullptr;
  RunController* run = nullptr;
};

class ProtocolClient {
 public:
  void begin(const SwarmControllers& ctrls);
  void service();
  bool isLinked() const { return linked_; }
  void sendStatus(bool force = false);
  void handleSerialLine(const String& line);
  void onWsEvent(WStype_t type, uint8_t* payload, size_t length);

  static bool isMessageTooLarge(size_t nbytes) { return nbytes > SWARM_MAX_WS_MESSAGE_BYTES; }
  IdempotencyCache& idempotency() { return idem_; }

 private:
  SwarmControllers c_;
  WebSocketsClient ws_;
  IdempotencyCache idem_;
  bool linked_ = false;
  bool socketStarted_ = false;
  uint32_t lastStatusMs_ = 0;
  uint32_t lastConnectAttemptMs_ = 0;
  bool mirrorSerialJson_ = false;
  /** Bounded reconnect / stall diagnostics (0.3.8). */
  uint32_t wsConnectAttempts_ = 0;
  uint32_t wsConnectFailures_ = 0;
  uint32_t wsDisconnects_ = 0;
  uint32_t incompleteStopCount_ = 0;
  uint32_t lastIncompleteStopLogMs_ = 0;
  bool wsReconnectDeferredLogged_ = false;

  void ensureSocket();
  bool autonomyActive() const;
  void handleMessage(JsonDocument& doc);
  void sendJson(const JsonDocument& doc);
  void sendAck(const char* messageId, bool ok, const char* detail, bool remember = true);
  void sendEvent(const char* type, JsonObjectConst extraPayload);
  void fillStatus(JsonObject obj) const;
  bool applyConfigObject(JsonObjectConst obj, bool persist, String* error);
  void handleDisconnectPolicy();
  bool targetMatches(const char* target) const;
  bool parseBoundedJson(const char* data, size_t len, JsonDocument& doc);
  void operatorStop();
  bool motionCritical() const;
  bool commandRequiresIdempotency(const char* type) const;
};

}  // namespace swarm
