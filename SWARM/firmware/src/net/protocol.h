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
#include "ws_queues.h"

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
  /** Motor-loop path: clock/run/state + inbound command handling + status enqueue. */
  void serviceLocal();
  /** Network-task path: ensureSocket + ws_.loop + outbound sendTXT. */
  void serviceNetwork();
  /**
   * Cooperative entry: when net-isolated, only serviceLocal(); otherwise local+network
   * on the Arduino loop (0.3.10-style).
   */
  void service();
  bool isLinked() const { return linked_; }
  void sendStatus(bool force = false);
  void handleSerialLine(const String& line);
  void onWsEvent(WStype_t type, uint8_t* payload, size_t length);
  WsBridge& bridge() { return bridge_; }

  static bool isMessageTooLarge(size_t nbytes) { return nbytes > SWARM_MAX_WS_MESSAGE_BYTES; }
  IdempotencyCache& idempotency() { return idem_; }

 private:
  SwarmControllers c_;
  WebSocketsClient ws_;
  IdempotencyCache idem_;
  WsBridge bridge_;
  volatile bool linked_ = false;
  volatile bool socketStarted_ = false;
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
  volatile bool forceStatus_ = false;
  /** Priority inbound slot for stop/stop_all (parsed on motor loop with full target checks). */
  volatile bool stopFramePending_ = false;
  uint16_t stopFrameLen_ = 0;
  char stopFrame_[SWARM_MAX_WS_MESSAGE_BYTES];

  void ensureSocket();
  bool autonomyActive() const;
  bool networkIsolated() const;
  void handleMessage(JsonDocument& doc);
  void sendJson(const JsonDocument& doc);
  void sendAck(const char* messageId, bool ok, const char* detail, bool remember = true);
  void sendEvent(const char* type, JsonObjectConst extraPayload);
  void fillStatus(JsonObject obj) const;
  bool applyConfigObject(JsonObjectConst obj, bool persist, String* error);
  void handleDisconnectPolicy();
  void handleConnectSession();
  void drainInbound();
  bool targetMatches(const char* target) const;
  bool parseBoundedJson(const char* data, size_t len, JsonDocument& doc);
  void operatorStop();
  bool motionCritical() const;
  bool commandRequiresIdempotency(const char* type) const;
};

}  // namespace swarm
