#include <Arduino.h>

#include <swarm_limits.h>
#include <swarm_version.h>

#include "board/board.h"
#include "choreography/run_controller.h"
#include "choreography/track_player.h"
#include "config/config_store.h"
#include "homing/home_controller.h"
#include "motor/motion_planner.h"
#include "motor/motor_driver.h"
#include "net/net_task.h"
#include "net/protocol.h"
#include "net/wifi_manager.h"
#include "ota/ota_service.h"
#include "position/position.h"
#include "sensing/endstop.h"
#include "sync/clock_sync.h"
#include "system/module_state.h"
#include "util/log.h"

namespace {

swarm::ConfigStore gConfig;
swarm::ModuleStateMachine gState;
swarm::MotorDriver gMotor;
swarm::PositionModel gPosition;
swarm::Endstop gEndstop;
swarm::MotionPlanner gPlanner;
swarm::HomeController gHome;
swarm::WifiManager gWifi;
swarm::TrackPlayer gTrack;
swarm::OtaService gOta;
swarm::ClockSync gClock;
swarm::RunController gRun;
swarm::ProtocolClient gProtocol;

String gSerialLine;

void printBootBanner() {
  Serial.println();
  Serial.println(F("================================="));
  Serial.println(F(" SWARM v1 firmware"));
  Serial.printf(" version %s\n", SWARM_FW_VERSION);
  Serial.println(F(" Artificial Emotion / MauMau"));
  Serial.println(F("================================="));
  Serial.println(F("Boot: coils safe, position INVALID, no auto motion"));
  Serial.println(F("Type 'help' for Serial commissioning commands"));
  Serial.println();
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(500);

  swarm::boardInit();
  gMotor.begin();
  gMotor.release();
  gEndstop.begin();
  gPosition.begin();
  gState.begin();
  gConfig.begin();
  gClock.begin();

  gPlanner.begin(&gMotor, &gPosition, &gConfig, &gEndstop);
  gHome.begin(&gPlanner, &gEndstop, &gPosition, &gConfig, &gState);
  gTrack.begin(&gPlanner, &gPosition, &gConfig, &gState);
  gRun.begin(&gTrack, &gClock);
  gOta.begin(&gConfig, &gState);
  gWifi.begin(&gConfig);

  swarm::SwarmControllers ctrls;
  ctrls.config = &gConfig;
  ctrls.state = &gState;
  ctrls.position = &gPosition;
  ctrls.endstop = &gEndstop;
  ctrls.planner = &gPlanner;
  ctrls.home = &gHome;
  ctrls.wifi = &gWifi;
  ctrls.track = &gTrack;
  ctrls.ota = &gOta;
  ctrls.clock = &gClock;
  ctrls.run = &gRun;
  gProtocol.begin(ctrls);
  swarm::startNetworkTask(&gProtocol);

  printBootBanner();

  if (!gConfig.isProvisioned()) {
    SWARM_LOG("UNPROVISIONED — set_module_id Mau0N before install");
    gState.setUnhomed();
  } else {
    SWARM_LOG("Identity %s", gConfig.get().moduleId);
    gState.setConnecting();
  }
}

void loop() {
  uint8_t serialBudget = 64;
  while (Serial.available() && serialBudget--) {
    const char ch = static_cast<char>(Serial.read());
    if (ch == '\n' || ch == '\r') {
      if (gSerialLine.length() > 0) {
        gProtocol.handleSerialLine(gSerialLine);
        gSerialLine = "";
      }
    } else if (gSerialLine.length() < SWARM_MAX_SERIAL_LINE_BYTES) {
      gSerialLine += ch;
    } else {
      gSerialLine = "";
      SWARM_LOG("serial overflow — line discarded");
    }
  }

  gEndstop.service();
  gHome.service();
  gPlanner.service();
  gPlanner.service();

  gWifi.service();
  gTrack.service();
  gOta.service();

  if (gState.state() == swarm::ModuleState::Connecting && gWifi.isConnected()) {
    gState.setUnhomed();
  }
  if (gState.state() != swarm::ModuleState::Fault &&
      gState.state() != swarm::ModuleState::Homing &&
      gState.state() != swarm::ModuleState::Moving &&
      gState.state() != swarm::ModuleState::Stopping &&
      gState.state() != swarm::ModuleState::Updating &&
      gState.state() != swarm::ModuleState::Ready) {
    if (!gWifi.isConnected() && gConfig.isProvisioned() &&
        gState.state() != swarm::ModuleState::Unhomed) {
      gState.setConnecting();
    }
  }

  gProtocol.service();
  gPlanner.service();
}
