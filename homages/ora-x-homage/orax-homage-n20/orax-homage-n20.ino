const int motorPin = 5;

void setup() {
  pinMode(motorPin, OUTPUT);
  digitalWrite(motorPin, LOW);
}

void loop() {
  digitalWrite(motorPin, HIGH);
  delay(2000);
}