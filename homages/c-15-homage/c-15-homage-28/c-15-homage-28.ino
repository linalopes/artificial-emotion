
#include <AccelStepper.h>

// Pinos do ULN2003
#define IN1 8
#define IN2 9
#define IN3 10
#define IN4 11

// Motor 28BYJ-48
const long STEPS_PER_REV = 4096;

// Velocidade
const float RPM = 4.0;

AccelStepper stepper(
  AccelStepper::HALF4WIRE,
  IN1, IN3, IN2, IN4
);

int direction = 1;
long targetPosition = STEPS_PER_REV;

void setup() {
  float speed = (RPM * STEPS_PER_REV) / 60.0;

  stepper.setMaxSpeed(speed);
  stepper.setSpeed(speed);
}

void loop() {
  // Movimento contínuo em velocidade constante
  stepper.runSpeed();

  // Ao completar 360°, inverte imediatamente
  if (stepper.currentPosition() == targetPosition) {
    direction = -direction;

    stepper.setSpeed(direction * (RPM * STEPS_PER_REV) / 60.0);

    // Próximo destino: volta ao ponto inicial
    targetPosition = (direction == 1) ? STEPS_PER_REV : 0;
  }
}
