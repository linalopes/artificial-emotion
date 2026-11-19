
/*
 * Artificial Emotion - Standalone Stepper
 * Arduino Uno + ULN2003 + 28BYJ-48
 * Speed: 2 RPM
 * Direction: Clockwise
 */

const uint8_t motorPins[] = {10, 11, 12, 13};

const float RPM = 2.0;
const long STEPS_PER_REV = 4096;
const bool CLOCKWISE = true;

const unsigned long STEP_INTERVAL =
    60000000.0 / (RPM * STEPS_PER_REV);

// Half-step sequence
const uint8_t sequence[8][4] = {
  {1, 0, 0, 0},
  {1, 1, 0, 0},
  {0, 1, 0, 0},
  {0, 1, 1, 0},
  {0, 0, 1, 0},
  {0, 0, 1, 1},
  {0, 0, 0, 1},
  {1, 0, 0, 1}
};

uint8_t phase = 0;
unsigned long lastStep = 0;

void setup() {
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(motorPins[i], OUTPUT);
    digitalWrite(motorPins[i], LOW);
  }
}

void loop() {
  unsigned long now = micros();

  if (now - lastStep >= STEP_INTERVAL) {
    lastStep = now;

    for (uint8_t i = 0; i < 4; i++) {
      digitalWrite(motorPins[i], sequence[phase][i]);
    }

    if (CLOCKWISE) {
      phase = (phase + 1) % 8;
    } else {
      phase = (phase + 7) % 8;
    }
  }
}
