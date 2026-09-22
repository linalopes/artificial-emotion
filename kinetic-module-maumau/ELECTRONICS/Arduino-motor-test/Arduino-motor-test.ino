// Artificial Emotion
// ESP32-S3 Super Mini
// 28BYJ-48 + ULN2003
// Home switch on GPIO 8

const int IN1 = 4;
const int IN2 = 5;
const int IN3 = 6;
const int IN4 = 7;

const int HOME_PIN = 8;

// Half-step sequence for 28BYJ-48
const int sequence[8][4] = {
  {1, 0, 0, 0},
  {1, 1, 0, 0},
  {0, 1, 0, 0},
  {0, 1, 1, 0},
  {0, 0, 1, 0},
  {0, 0, 1, 1},
  {0, 0, 0, 1},
  {1, 0, 0, 1}
};

const unsigned long MOVE_TIME_MS = 8000;  // 8 seconds
const int STEP_DELAY_US = 1200;

void setStep(int stepIndex) {
  digitalWrite(IN1, sequence[stepIndex][0]);
  digitalWrite(IN2, sequence[stepIndex][1]);
  digitalWrite(IN3, sequence[stepIndex][2]);
  digitalWrite(IN4, sequence[stepIndex][3]);
}

void releaseMotor() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

bool homeTriggered() {
  return digitalRead(HOME_PIN) == LOW;
}

void moveForTime(bool direction, unsigned long durationMs) {
  unsigned long startTime = millis();

  while (millis() - startTime < durationMs) {

    for (int s = 0; s < 8; s++) {

      // Check switch constantly during movement
      if (homeTriggered()) {
        releaseMotor();
        Serial.println("HOME TRIGGERED -> MOTOR STOPPED");

        // Wait until switch is released
        while (homeTriggered()) {
          delay(10);
        }

        Serial.println("HOME RELEASED");
        return;
      }

      int index;

      if (direction) {
        index = s;
      } else {
        index = 7 - s;
      }

      setStep(index);
      delayMicroseconds(STEP_DELAY_US);
    }
  }

  releaseMotor();
}

void setup() {
  Serial.begin(115200);

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  pinMode(HOME_PIN, INPUT_PULLUP);

  releaseMotor();

  Serial.println("Artificial Emotion motor test");
  Serial.println("Press the microswitch to stop the motor.");
}

void loop() {

  Serial.println("Direction A");
  moveForTime(true, MOVE_TIME_MS);

  delay(1500);

  Serial.println("Direction B");
  moveForTime(false, MOVE_TIME_MS);

  delay(1500);
}