/*
  BioPod ESP32 firmware (Arduino)
  Reads 4x DHT22 / AM2302B, on/off hysteresis control, POSTs JSON to the dashboard.

  Libraries: DHT sensor library (Adafruit).
  Dashboard: run `python server.py` then set DASHBOARD_HOST to this PC's LAN IP.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include "DHT.h"

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* DASHBOARD_HOST = "192.168.1.10";
const uint16_t DASHBOARD_PORT = 8080;

const float TEMP_SETPOINT = 37.0;
const float HUM_SETPOINT = 50.0;
const float TEMP_BAND = 0.5;
const float HUM_BAND = 5.0;

#define DHTTYPE DHT22
const int DHT_PINS[4] = {14, 27, 26, 25};
const int PIN_HEATER = 32;
const int PIN_PELTIER = 33;
const int PIN_FAN = 18;
const int PIN_HUMIDIFIER = 19;

DHT dht0(DHT_PINS[0], DHTTYPE);
DHT dht1(DHT_PINS[1], DHTTYPE);
DHT dht2(DHT_PINS[2], DHTTYPE);
DHT dht3(DHT_PINS[3], DHTTYPE);
DHT* sensors[4] = {&dht0, &dht1, &dht2, &dht3};

bool heaterOn = false;
bool peltierOn = false;
bool humidifierOn = false;

String numOrNull(float v) {
  if (isnan(v)) return "null";
  return String(v, 2);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_HEATER, OUTPUT);
  pinMode(PIN_PELTIER, OUTPUT);
  pinMode(PIN_FAN, OUTPUT);
  pinMode(PIN_HUMIDIFIER, OUTPUT);
  digitalWrite(PIN_FAN, HIGH);

  for (int i = 0; i < 4; i++) sensors[i]->begin();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.println(WiFi.localIP());
}

void loop() {
  float temps[4];
  float hums[4];
  float tSum = 0, hSum = 0;
  int tCount = 0, hCount = 0;

  for (int i = 0; i < 4; i++) {
    temps[i] = sensors[i]->readTemperature();
    hums[i] = sensors[i]->readHumidity();
    if (!isnan(temps[i])) { tSum += temps[i]; tCount++; }
    if (!isnan(hums[i])) { hSum += hums[i]; hCount++; }
  }

  float avgT = tCount ? tSum / tCount : NAN;
  float avgH = hCount ? hSum / hCount : NAN;

  if (!isnan(avgT)) {
    if (avgT < TEMP_SETPOINT - TEMP_BAND) { heaterOn = true; peltierOn = false; }
    else if (avgT > TEMP_SETPOINT + TEMP_BAND) { heaterOn = false; peltierOn = true; }
    else { heaterOn = false; peltierOn = false; }
  }
  if (!isnan(avgH)) {
    humidifierOn = avgH < HUM_SETPOINT - HUM_BAND;
  }

  digitalWrite(PIN_HEATER, heaterOn ? HIGH : LOW);
  digitalWrite(PIN_PELTIER, peltierOn ? HIGH : LOW);
  digitalWrite(PIN_HUMIDIFIER, humidifierOn ? HIGH : LOW);
  digitalWrite(PIN_FAN, HIGH);

  if (WiFi.status() == WL_CONNECTED && tCount > 0) {
    HTTPClient http;
    String url = String("http://") + DASHBOARD_HOST + ":" + DASHBOARD_PORT + "/api/reading";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    String body = "{";
    body += "\"temps\":[" + numOrNull(temps[0]) + "," + numOrNull(temps[1]) + "," +
            numOrNull(temps[2]) + "," + numOrNull(temps[3]) + "],";
    body += "\"hums\":[" + numOrNull(hums[0]) + "," + numOrNull(hums[1]) + "," +
            numOrNull(hums[2]) + "," + numOrNull(hums[3]) + "],";
    body += "\"setpoints\":{\"temp\":" + String(TEMP_SETPOINT, 1) +
            ",\"hum\":" + String(HUM_SETPOINT, 1) + "},";
    body += "\"actuators\":{\"heater\":" + String(heaterOn ? "true" : "false") +
            ",\"peltier\":" + String(peltierOn ? "true" : "false") +
            ",\"fan\":true,\"humidifier\":" + String(humidifierOn ? "true" : "false") + "}";
    body += "}";

    int code = http.POST(body);
    Serial.printf("POST %d %s\n", code, body.c_str());
    http.end();
  }

  delay(5000);
}
