
#include <Arduino.h>

// Artificial Emotion Controller V1
// Motion Test V2
// ESP32-S3 + ULN2003A + 28BYJ-48
//
// Modes:
// 1 = Continuous clockwise, 2 RPM (default)
// 2 = Continuous counterclockwise, 2 RPM
// 3 = Alternating 360-degree rotation, 2 RPM
//
// User button cycles through the three modes.
// Limit switch stops and latches motor movement.
// Serial commands: 1, 2, 3, 0, ?

const uint8_t MOTOR_PINS[4] = {10, 11, 12, 13};
const uint8_t BUTTON_PIN = 7;
const uint8_t LIMIT_PIN = 1;

// Motor parameters
const uint32_t STEPS_PER_REV = 4096;
const float RPM = 2.0f;
const uint32_t STEP_INTERVAL_US =
    (uint32_t)(60000000.0f / (RPM * STEPS_PER_REV));

// Reverse the previous diagnostic's direction mapping.
const int8_t CW_DIRECTION = -1;
const int8_t CCW_DIRECTION = 1;

// Half-step sequence for ULN2003A
const uint8_t SEQUENCE[8] = {
  0b0001, 0b0011, 0b0010, 0b0110,
  0b0100, 0b1100, 0b1000, 0b1001
};

// Limit switch uses COM + NC contacts.
// LOW = normal, HIGH = triggered or disconnected.
const uint32_t DEBOUNCE_MS = 30;

uint8_t mode = 1;
bool running = false;
bool limitLatched = false;

int8_t phaseIndex = 0;
int8_t direction = CW_DIRECTION;

uint32_t stepsInLeg = 0;
uint32_t lastStepMicros = 0;

bool lastButtonReading = HIGH;
bool buttonStable = HIGH;
uint32_t buttonChangedAt = 0;

bool lastLimitReading = LOW;
bool limitStable = LOW;
uint32_t limitChangedAt = 0;

void releaseMotor() {
  for (uint8_t i = 0; i < 4; i++) {
    digitalWrite(MOTOR_PINS[i], LOW);
  }
}

void stopMotor() {
  running = false;
  releaseMotor();
}

void applyPhase() {
  uint8_t pattern = SEQUENCE[phaseIndex];

  for (uint8_t i = 0; i < 4; i++) {
    digitalWrite(
      MOTOR_PINS[i],
      (pattern & (1 << i)) ? HIGH : LOW
    );
  }
}

void printMenu() {
  Serial.println();
  Serial.println("=================================");
  Serial.println(" ARTIFICIAL EMOTION CONTROLLER V1");
  Serial.println(" MOTION TEST V2");
  Serial.println("=================================");
  Serial.println("1 = Continuous CW / 2 RPM");
  Serial.println("2 = Continuous CCW / 2 RPM");
  Serial.println("3 = Oscillation +/-360 / 2 RPM");
  Serial.println("0 = Stop and release motor");
  Serial.println("? = Show menu");
  Serial.println();
  Serial.println("USER BUTTON: Cycle through modes");
  Serial.println("ENDSTOP: COM + NC on J6");
  Serial.println("=================================");
}

void selectMode(uint8_t newMode) {
  if (newMode < 1 || newMode > 3) return;

  // Never restart against a pressed or disconnected switch.
  if (digitalRead(LIMIT_PIN) == HIGH ||
      limitStable == HIGH) {
    stopMotor();
    Serial.println("[BLOCKED] Limit switch is active.");
    return;
  }

  limitLatched = false;
  mode = newMode;
  stepsInLeg = 0;

  direction = (mode == 2)
                  ? CCW_DIRECTION
                  : CW_DIRECTION;

  lastStepMicros = micros();
  running = true;

  Serial.println();
  Serial.printf("[MODE %u] ", mode);

  if (mode == 1) {
    Serial.println("Continuous CW, 2 RPM");
  } else if (mode == 2) {
    Serial.println("Continuous CCW, 2 RPM");
  } else {
    Serial.println("Oscillation +/-360, 2 RPM");
  }
}

void updateLimit() {
  bool reading = digitalRead(LIMIT_PIN);

  // Stop immediately when the NC contact opens.
  // Debouncing is used only for the status message.
  if (reading == HIGH && running) {
    stopMotor();
    limitLatched = true;
    Serial.println("[LIMIT] Motor stopped.");
  }

  if (reading != lastLimitReading) {
    limitChangedAt = millis();
  }

  if (millis() - limitChangedAt >= DEBOUNCE_MS &&
      reading != limitStable) {
    limitStable = reading;

    if (limitStable == HIGH) {
      Serial.println("[LIMIT] Triggered or disconnected.");
    } else {
      Serial.println("[LIMIT] Released.");
      if (limitLatched) {
        Serial.println("[LIMIT] Select a mode to restart.");
      }
    }
  }

  lastLimitReading = reading;
}

void updateButton() {
  bool reading = digitalRead(BUTTON_PIN);

  if (reading != lastButtonReading) {
    buttonChangedAt = millis();
  }

  if (millis() - buttonChangedAt >= DEBOUNCE_MS &&
      reading != buttonStable) {

    buttonStable = reading;

    if (buttonStable == LOW) {
      uint8_t nextMode = (mode % 3) + 1;
      selectMode(nextMode);
    }
  }

  lastButtonReading = reading;
}

void updateMotor() {
  if (!running) return;

  uint32_t now = micros();

  if ((uint32_t)(now - lastStepMicros) <
      STEP_INTERVAL_US) {
    return;
  }

  // Limit safety check immediately before stepping.
  if (digitalRead(LIMIT_PIN) == HIGH) {
    stopMotor();
    limitLatched = true;
    Serial.println("[LIMIT] Motor stopped.");
    return;
  }

  lastStepMicros += STEP_INTERVAL_US;

  phaseIndex += direction;

  if (phaseIndex > 7) phaseIndex = 0;
  if (phaseIndex < 0) phaseIndex = 7;

  applyPhase();

  if (mode == 3) {
    stepsInLeg++;

    if (stepsInLeg >= STEPS_PER_REV) {
      stepsInLeg = 0;
      direction = -direction;

      Serial.println(
        direction == CW_DIRECTION
          ? "[MOTOR] Reversing to CW"
          : "[MOTOR] Reversing to CCW"
      );
    }
  }
}

void updateSerial() {
  while (Serial.available()) {
    char command = Serial.read();

    if (command >= '1' && command <= '3') {
      selectMode(command - '0');
    } else if (command == '0') {
      stopMotor();
      Serial.println("[MOTOR] Stopped.");
    } else if (command == '?') {
      printMenu();
    }
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LIMIT_PIN, INPUT_PULLUP);

  for (uint8_t i = 0; i < 4; i++) {
    digitalWrite(MOTOR_PINS[i], LOW);
    pinMode(MOTOR_PINS[i], OUTPUT);
  }

  releaseMotor();

  delay(800);
  printMenu();

  if (digitalRead(LIMIT_PIN) == LOW) {
    limitStable = LOW;
    lastLimitReading = LOW;
    selectMode(1);
  } else {
    limitStable = HIGH;
    lastLimitReading = HIGH;
    limitLatched = true;
    Serial.println(
      "[LIMIT] Active or disconnected at startup."
    );
    Serial.println("[MOTOR] Startup inhibited.");
  }
}

void loop() {
  updateLimit();
  updateButton();
  updateSerial();
  updateMotor();
}
