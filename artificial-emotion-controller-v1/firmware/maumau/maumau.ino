#include <Arduino.h>

// Artificial Emotion Controller v1 | MauMau v1.0.0
// ESP32-S3 Super Mini + ULN2003A + 28BYJ-48 (5 V)
// Commission with no suspended load. Verify direction and travel first.
const uint8_t MOTOR_PINS[] = {10, 11, 12, 13};
const uint8_t BUTTON_PIN = 7, LIMIT_PIN = 1;
const int8_t HOME_DIR = -1; // CW in Motion Test; verify physically!
const int8_t AWAY_DIR = -HOME_DIR;
const uint32_t STEPS_PER_REV = 4096;
const float RPM = 2.0f, HOME_RPM = 1.0f;
const uint32_t STEP_US = 60000000.0f / (RPM * STEPS_PER_REV);
const uint32_t HOME_US = 60000000.0f / (HOME_RPM * STEPS_PER_REV);
// Conservative commissioning defaults, not calibrated travel limits.
const uint32_t MAX_HOME_STEPS = 4096;
const uint32_t MAX_BACKOFF_STEPS = 256;
const uint32_t HOME_CLEARANCE_STEPS = 32;
const uint32_t TRAVEL_STEPS = 512;
const uint32_t HOME_TIMEOUT_MS = 70000;
const uint32_t DEBOUNCE_MS = 30;
const uint8_t SEQUENCE[] = {1,3,2,6,4,12,8,9};

enum State { FAULT, SEEK_HOME, CONFIRM_OPEN, BACKOFF, CLEARANCE,
             READY, OUTBOUND, INBOUND, PAUSED };
State state = FAULT, pausedState = READY;
uint8_t phase = 0;
bool energized = false;
uint32_t lastStep = 0, homeStart = 0, stateStart = 0;
uint32_t seekSteps = 0, backoffSteps = 0, clearanceSteps = 0, position = 0;
bool buttonRaw = HIGH, buttonStable = HIGH;
uint32_t buttonChanged = 0;

bool limitOpen() { return digitalRead(LIMIT_PIN) == HIGH; }
void applyPhase() {
  for (uint8_t i = 0; i < 4; i++)
    digitalWrite(MOTOR_PINS[i], (SEQUENCE[phase] & (1 << i)) ? HIGH : LOW);
  energized = true;
}
void stepMotor(int8_t dir) {
  phase = (phase + (dir > 0 ? 1 : 7)) % 8;
  applyPhase();
}
bool due(uint32_t interval) {
  uint32_t now = micros();
  if ((uint32_t)(now - lastStep) < interval) return false;
  lastStep = now; // no catch-up bursts
  return true;
}
void enter(State s) { state = s; stateStart = millis(); lastStep = micros(); }
void fault(const char* reason) {
  enter(FAULT); // retain last energized phase; never initiate motion here
  Serial.print("[FAULT] "); Serial.println(reason);
}
void startHome() {
  if (state != FAULT && state != READY && state != PAUSED) return;
  if (limitOpen()) { fault("NC open at start: inspect switch/wiring; no motion"); return; }
  seekSteps = backoffSteps = clearanceSteps = 0;
  homeStart = millis();
  enter(SEEK_HOME);
  Serial.println("[HOME] Seeking switch");
}
bool homing() {
  return state == SEEK_HOME || state == CONFIRM_OPEN ||
         state == BACKOFF || state == CLEARANCE;
}
void updateMotion() {
  if (homing() && (uint32_t)(millis() - homeStart) >= HOME_TIMEOUT_MS) {
    fault("Homing timeout"); return;
  }
  switch (state) {
    case SEEK_HOME:
      if (limitOpen()) { enter(CONFIRM_OPEN); return; }
      if (seekSteps >= MAX_HOME_STEPS) { fault("Home step limit"); return; }
      if (due(HOME_US)) { stepMotor(HOME_DIR); seekSteps++; }
      break;
    case CONFIRM_OPEN:
      // No steps while confirming an open contact.
      if (!limitOpen()) { fault("Unstable home contact"); return; }
      if ((uint32_t)(millis() - stateStart) >= DEBOUNCE_MS) enter(BACKOFF);
      break;
    case BACKOFF:
      // An open contact may be a broken wire. Only a bounded move away is allowed.
      if (!limitOpen()) { enter(CLEARANCE); return; }
      if (backoffSteps >= MAX_BACKOFF_STEPS) { fault("Switch did not close on backoff"); return; }
      if (due(HOME_US)) { stepMotor(AWAY_DIR); backoffSteps++; }
      break;
    case CLEARANCE:
      if (limitOpen()) { fault("NC reopened during clearance"); return; }
      if (clearanceSteps >= HOME_CLEARANCE_STEPS) {
        position = 0; enter(READY); Serial.println("[HOME] Ready; press USER to start"); return;
      }
      if (due(HOME_US)) { stepMotor(AWAY_DIR); clearanceSteps++; }
      break;
    case READY: case PAUSED: case OUTBOUND: case INBOUND:
      if (limitOpen()) { fault("Unexpected endstop opening or disconnected wire"); return; }
      if (state == OUTBOUND && due(STEP_US)) {
        if (position >= TRAVEL_STEPS) { enter(INBOUND); return; }
        stepMotor(AWAY_DIR); position++;
        if (position >= TRAVEL_STEPS) enter(INBOUND);
      } else if (state == INBOUND && due(STEP_US)) {
        if (position == 0) { enter(OUTBOUND); return; }
        stepMotor(HOME_DIR); position--;
        if (position == 0) enter(OUTBOUND);
      }
      break;
    case FAULT: break;
  }
}
void stopMotion() {
  if (homing()) { fault("Homing cancelled; re-home required"); return; }
  if (state == OUTBOUND || state == INBOUND) {
    pausedState = state; enter(PAUSED); Serial.println("[PAUSE] Holding phase");
  }
}
void startMotion() {
  if (limitOpen()) { fault("NC open; start inhibited"); return; }
  if (state == READY) enter(OUTBOUND);
  else if (state == PAUSED) enter(pausedState);
}
void userAction() {
  if (state == FAULT) startHome();
  else if (state == READY || state == PAUSED) startMotion();
  else stopMotion();
}
void updateButton() {
  bool raw = digitalRead(BUTTON_PIN);
  if (raw != buttonRaw) { buttonRaw = raw; buttonChanged = millis(); }
  if (raw != buttonStable && (uint32_t)(millis() - buttonChanged) >= DEBOUNCE_MS) {
    buttonStable = raw;
    if (raw == LOW) userAction();
  }
}
void menu() {
  Serial.println("MauMau v1.0.0 | h=home, 1=start/resume, 0=pause, ?=menu/status");
  Serial.printf("state=%u position=%lu NC=%s holding=%s\n", (unsigned)state,
                (unsigned long)position, limitOpen() ? "OPEN" : "CLOSED", energized ? "yes" : "no");
}
void setup() {
  Serial.begin(115200);
  for (uint8_t p : MOTOR_PINS) { digitalWrite(p, LOW); pinMode(p, OUTPUT); }
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LIMIT_PIN, INPUT_PULLUP);
  buttonRaw = buttonStable = digitalRead(BUTTON_PIN);
  menu();
  startHome();
}
void loop() {
  updateMotion();
  updateButton();
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 'h') startHome();
    else if (c == '1') startMotion();
    else if (c == '0') stopMotion();
    else if (c == '?') menu();
  }
}
