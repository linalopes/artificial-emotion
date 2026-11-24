#include <Servo.h>

Servo myServo;

const int SERVO_PIN = 14; // D5
const int MIN_ANGLE = 0;
const int MAX_ANGLE = 180;
const int STEP_DELAY = 15;
const int PAUSE = 500;

void setup() {
  myServo.attach(SERVO_PIN);
  myServo.write(MIN_ANGLE);
  delay(1000);
}

void loop() {
  // Forward: 0° to 180°
  for (int pos = MIN_ANGLE; pos <= MAX_ANGLE; pos++) {
    myServo.write(pos);
    delay(STEP_DELAY);
  }

  delay(PAUSE);

  // Backward: 180° to 0°
  for (int pos = MAX_ANGLE; pos >= MIN_ANGLE; pos--) {
    myServo.write(pos);
    delay(STEP_DELAY);
  }

  delay(PAUSE);
}