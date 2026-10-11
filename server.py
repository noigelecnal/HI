#!/usr/bin/env python3
"""Local BioPod dashboard server.

Serves the web app and accepts ESP32 telemetry at POST /api/reading.

Usage:
    python server.py

Then open http://127.0.0.1:8080
Point the ESP32 HTTP client at http://<this-pc-lan-ip>:8080/api/reading
"""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import time

ROOT = Path(__file__).resolve().parent
STATE_FILE = ROOT / "telemetry.json"
PORT = 8080

latest = {
    "id": 0,
    "temps": None,
    "hums": None,
    "time": None,
    "actuators": None,
    "setpoints": None,
}


def load_state():
    global latest
    if STATE_FILE.exists():
        try:
            latest = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass


def save_state():
    STATE_FILE.write_text(json.dumps(latest), encoding="utf-8")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/api/reading":
            body = json.dumps(latest).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def do_POST(self):
        global latest
        if self.path.split("?")[0] != "/api/reading":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_error(400, "Invalid JSON")
            return
        latest = {
            "id": int(time.time() * 1000),
            "temps": payload.get("temps"),
            "hums": payload.get("hums"),
            "time": payload.get("time", int(time.time() * 1000)),
            "actuators": payload.get("actuators"),
            "setpoints": payload.get("setpoints"),
        }
        save_state()
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print("[%s] %s" % (self.log_date_time_string(), format % args))


if __name__ == "__main__":
    load_state()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("BioPod dashboard  http://127.0.0.1:%s" % PORT)
    print("ESP32 POST JSON   http://<pc-ip>:%s/api/reading" % PORT)
    print('Example body: {"temps":[36.8,37.0,36.9,37.1],"hums":[49,50,51,50]}')
    server.serve_forever()
