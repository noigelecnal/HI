import json
import urllib.request

payload = {
    "temps": [38.4, 38.2, 38.1, 38.3],
    "hums": [61, 59, 60, 62],
    "actuators": {
        "heater": False,
        "peltier": True,
        "fan": True,
        "humidifier": False,
    },
}
req = urllib.request.Request(
    "http://127.0.0.1:8080/api/reading",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
)
print(urllib.request.urlopen(req).read().decode("utf-8"))
