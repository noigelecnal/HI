var TEMP_TOLERANCE = 0.5;
var HUM_TOLERANCE = 5;
var LOG_INTERVAL_MS = 30 * 60 * 1000;

var READINGS_KEY = "biopod_readings";
var SETPOINTS_KEY = "biopod_setpoints";
var EVENTS_KEY = "biopod_events";
var ALERTS_KEY = "biopod_alerts";
var METRICS_KEY = "biopod_metrics";

var readings = [];
var events = [];
var alerts = [];
var setpoints = { temp: 37, hum: 50 };
var actuators = { heater: false, peltier: false, fan: true, humidifier: false };
var metrics = {
  lastAdtSec: null,
  lastRtSec: null,
  disturbanceAt: null,
  outOfRangeAt: null,
  waitingForRecovery: false
};

var tempChart = null;
var humChart = null;
var demoTimer = null;
var pollTimer = null;
var demoState = null;
var SENSOR_COLORS = ["#1f6b4a", "#c45c26", "#3d6b8b", "#c9a227"];

function pad(num) {
  return num < 10 ? "0" + num : "" + num;
}

function formatTime(ms) {
  var d = new Date(ms);
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() +
    " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function toInputValue(ms) {
  var d = new Date(ms);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function average(list) {
  var sum = 0;
  var count = 0;
  for (var i = 0; i < list.length; i++) {
    if (list[i] !== null && list[i] !== undefined && !isNaN(list[i])) {
      sum += list[i];
      count += 1;
    }
  }
  return count === 0 ? null : sum / count;
}

function showNumber(value, digits) {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return Number(value).toFixed(digits === undefined ? 1 : digits);
}

function rangeOf(list) {
  var vals = list.filter(function (v) { return v !== null && !isNaN(v); });
  if (vals.length === 0) return null;
  return Math.max.apply(null, vals) - Math.min.apply(null, vals);
}

function inTempBand(t, sp) {
  return t !== null && Math.abs(t - sp.temp) <= TEMP_TOLERANCE;
}

function inHumBand(h, sp) {
  return h !== null && Math.abs(h - sp.hum) <= HUM_TOLERANCE;
}

function getStatus(avgTemp, avgHum, sp) {
  if (avgTemp === null && avgHum === null) return "No data";
  var tempOk = avgTemp === null ? true : inTempBand(avgTemp, sp);
  var humOk = avgHum === null ? true : inHumBand(avgHum, sp);
  return tempOk && humOk ? "In range" : "Out of range";
}

function saveData() {
  localStorage.setItem(READINGS_KEY, JSON.stringify(readings));
  localStorage.setItem(SETPOINTS_KEY, JSON.stringify(setpoints));
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
}

function loadData() {
  try {
    var savedReadings = localStorage.getItem(READINGS_KEY);
    var savedSetpoints = localStorage.getItem(SETPOINTS_KEY);
    var savedEvents = localStorage.getItem(EVENTS_KEY);
    var savedAlerts = localStorage.getItem(ALERTS_KEY);
    var savedMetrics = localStorage.getItem(METRICS_KEY);
    if (savedReadings) readings = JSON.parse(savedReadings);
    if (savedSetpoints) setpoints = JSON.parse(savedSetpoints);
    if (savedEvents) events = JSON.parse(savedEvents);
    if (savedAlerts) alerts = JSON.parse(savedAlerts);
    if (savedMetrics) metrics = Object.assign(metrics, JSON.parse(savedMetrics));
  } catch (err) {
    readings = [];
  }
}

function pushReading(temps, hums, time, source) {
  var avgTemp = average(temps);
  var avgHum = average(hums);
  var status = getStatus(avgTemp, avgHum, setpoints);
  var reading = {
    time: time || Date.now(),
    temps: temps,
    hums: hums,
    avgTemp: avgTemp,
    avgHum: avgHum,
    uniT: rangeOf(temps),
    uniH: rangeOf(hums),
    status: status,
    source: source || "manual",
    actuators: {
      heater: actuators.heater,
      peltier: actuators.peltier,
      fan: actuators.fan,
      humidifier: actuators.humidifier
    }
  };
  readings.push(reading);
  readings.sort(function (a, b) { return a.time - b.time; });
  handleAlertAndRecovery(reading);
  saveData();
  renderAll();
  return reading;
}

function isLiveSample(reading) {
  return Math.abs(Date.now() - reading.time) < 15000;
}

function handleAlertAndRecovery(reading) {
  if (!isLiveSample(reading)) return;
  if (reading.status === "Out of range") {
    if (metrics.outOfRangeAt === null) {
      metrics.outOfRangeAt = reading.time;
      var received = Date.now();
      var adt = Math.max(0, (received - reading.time) / 1000);
      metrics.lastAdtSec = adt;
      alerts.unshift({
        time: received,
        outAt: reading.time,
        adt: adt,
        message: "Out of range: " + showNumber(reading.avgTemp) + " °C / " +
          showNumber(reading.avgHum) + "% RH"
      });
      showToast("Alert · ADT " + adt.toFixed(1) + " s · " + alerts[0].message);
    }
  } else {
    if (metrics.waitingForRecovery && metrics.disturbanceAt) {
      metrics.lastRtSec = Math.max(0, (reading.time - metrics.disturbanceAt) / 1000);
      metrics.waitingForRecovery = false;
      metrics.disturbanceAt = null;
      alerts.unshift({
        time: Date.now(),
        message: "Recovered to setpoint band. RT = " + metrics.lastRtSec.toFixed(1) + " s"
      });
    }
    metrics.outOfRangeAt = null;
  }
}

function loggingCompleteness() {
  if (readings.length === 0) return { pct: null, valid: 0, expected: 0 };
  var start = readings[0].time;
  var end = readings[readings.length - 1].time;
  var expected = Math.floor((end - start) / LOG_INTERVAL_MS) + 1;
  var buckets = {};
  for (var i = 0; i < readings.length; i++) {
    var slot = Math.floor((readings[i].time - start) / LOG_INTERVAL_MS);
    buckets[slot] = true;
  }
  var valid = Object.keys(buckets).length;
  if (expected < 1) expected = 1;
  return { pct: (valid / expected) * 100, valid: valid, expected: expected };
}

function updateActuatorsFromAverages(avgTemp, avgHum) {
  if (avgTemp === null) return;
  actuators.heater = avgTemp < setpoints.temp - TEMP_TOLERANCE;
  actuators.peltier = avgTemp > setpoints.temp + TEMP_TOLERANCE;
  actuators.fan = true;
  actuators.humidifier = avgHum !== null && avgHum < setpoints.hum - HUM_TOLERANCE;
}

function addReading() {
  var temps = [];
  var hums = [];
  for (var i = 1; i <= 4; i++) {
    var tempText = document.getElementById("temp" + i).value;
    var humText = document.getElementById("hum" + i).value;
    var t = tempText === "" ? null : Number(tempText);
    var h = humText === "" ? null : Number(humText);
    if (t !== null && (isNaN(t) || t < 0 || t > 60)) {
      alert("Temperature for sensor " + i + " must be between 0 and 60.");
      return;
    }
    if (h !== null && (isNaN(h) || h < 0 || h > 100)) {
      alert("Humidity for sensor " + i + " must be between 0 and 100.");
      return;
    }
    temps.push(t);
    hums.push(h);
  }
  if (average(temps) === null && average(hums) === null) {
    alert("Please enter at least one sensor reading.");
    return;
  }
  var timeText = document.getElementById("readingTime").value;
  var time = timeText === "" ? Date.now() : new Date(timeText).getTime();
  updateActuatorsFromAverages(average(temps), average(hums));
  pushReading(temps, hums, time, "manual");
  clearForm();
}

function clearForm() {
  for (var i = 1; i <= 4; i++) {
    document.getElementById("temp" + i).value = "";
    document.getElementById("hum" + i).value = "";
  }
  document.getElementById("readingTime").value = toInputValue(Date.now());
}

function applySetpoint() {
  var newTemp = Number(document.getElementById("tempSetpoint").value);
  var newHum = Number(document.getElementById("humSetpoint").value);
  if (document.getElementById("tempSetpoint").value === "" ||
      document.getElementById("humSetpoint").value === "") {
    alert("Please enter both setpoints.");
    return;
  }
  if (isNaN(newTemp) || newTemp < 0 || newTemp > 60) {
    alert("Temperature setpoint must be between 0 and 60.");
    return;
  }
  if (isNaN(newHum) || newHum < 0 || newHum > 100) {
    alert("Humidity setpoint must be between 0 and 100.");
    return;
  }
  if (newTemp === setpoints.temp && newHum === setpoints.hum) {
    alert("Setpoints are unchanged.");
    return;
  }
  events.push({
    time: Date.now(),
    oldTemp: setpoints.temp,
    newTemp: newTemp,
    oldHum: setpoints.hum,
    newHum: newHum,
    label: makeSetpointLabel(setpoints.temp, newTemp, setpoints.hum, newHum)
  });
  setpoints.temp = newTemp;
  setpoints.hum = newHum;
  saveData();
  renderAll();
}

function makeSetpointLabel(oldTemp, newTemp, oldHum, newHum) {
  var parts = [];
  if (newTemp !== oldTemp) parts.push(oldTemp + " to " + newTemp + " °C");
  if (newHum !== oldHum) parts.push(oldHum + " to " + newHum + " %");
  return parts.join(", ");
}

function renderClock() {
  var now = new Date();
  document.getElementById("clock").textContent =
    pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
}

function renderStatus() {
  var box = document.getElementById("statusBanner");
  var text = document.getElementById("statusText");
  var kicker = document.getElementById("statusKicker");
  var pill = document.getElementById("livePill");
  var label = document.getElementById("liveLabel");

  if (demoTimer) {
    pill.className = "live-pill live";
    label.textContent = "Demo live";
  } else if (readings.length && readings[readings.length - 1].source === "esp32") {
    pill.className = "live-pill live";
    label.textContent = "ESP32 linked";
  } else {
    pill.className = "live-pill";
    label.textContent = readings.length ? "Logged" : "Standby";
  }

  if (readings.length === 0) {
    box.className = "status-banner";
    kicker.textContent = "Chamber status";
    text.textContent = "No readings yet. Start a live session, run the demo, or add a manual log.";
    return;
  }

  var latest = readings[readings.length - 1];
  var line = showNumber(latest.avgTemp) + " °C  ·  " + showNumber(latest.avgHum) + "% RH";
  if (latest.status === "Out of range") {
    box.className = "status-banner out";
    pill.classList.add("alert");
    kicker.textContent = "Out of range";
    text.textContent = line + "  —  outside the approved hysteresis band.";
  } else {
    box.className = "status-banner in";
    kicker.textContent = "In range";
    text.textContent = line + "  —  holding near  " + setpoints.temp + " °C / " + setpoints.hum + "% RH.";
  }
}

function renderKpis() {
  var latest = readings.length ? readings[readings.length - 1] : null;
  document.getElementById("kpiTemp").textContent = latest ? showNumber(latest.avgTemp) : "—";
  document.getElementById("kpiHum").textContent = latest ? showNumber(latest.avgHum) : "—";
  document.getElementById("kpiTempNote").textContent =
    "Setpoint " + setpoints.temp.toFixed(1) + " ± " + TEMP_TOLERANCE;
  document.getElementById("kpiHumNote").textContent =
    "Setpoint " + setpoints.hum.toFixed(0) + " ± " + HUM_TOLERANCE;
  if (latest && latest.uniT !== null) {
    document.getElementById("kpiUni").textContent =
      showNumber(latest.uniT) + " / " + showNumber(latest.uniH);
  } else {
    document.getElementById("kpiUni").textContent = "—";
  }
  var lc = loggingCompleteness();
  document.getElementById("kpiLc").textContent = lc.pct === null ? "—" : showNumber(lc.pct, 0);
  document.getElementById("kpiLcNote").textContent =
    lc.pct === null ? "30-minute expected slots" : lc.valid + " of " + lc.expected + " half-hour slots";
  document.getElementById("kpiAdt").textContent =
    metrics.lastAdtSec === null ? "—" : showNumber(metrics.lastAdtSec, 1);
  document.getElementById("kpiRt").textContent =
    metrics.lastRtSec === null ? "—" : showNumber(metrics.lastRtSec, 1);
  document.getElementById("kpiRtNote").textContent = metrics.waitingForRecovery
    ? "Waiting for return to band after disturbance"
    : "After last marked disturbance";
}

function renderChamber() {
  var latest = readings.length ? readings[readings.length - 1] : null;
  for (var i = 0; i < 4; i++) {
    var zone = document.getElementById("zone" + (i + 1));
    var tEl = document.getElementById("z" + (i + 1) + "t");
    var hEl = document.getElementById("z" + (i + 1) + "h");
    if (!latest) {
      zone.className = "zone";
      tEl.textContent = "—";
      hEl.textContent = "— % RH";
      continue;
    }
    var t = latest.temps[i];
    var h = latest.hums[i];
    tEl.textContent = showNumber(t) + "°";
    hEl.textContent = showNumber(h) + "% RH";
    var ok = (t === null || inTempBand(t, setpoints)) && (h === null || inHumBand(h, setpoints));
    zone.className = "zone " + (ok ? "in" : "out");
  }
}

function renderActuators() {
  setAct("actHeater", actuators.heater, "Heating", "Idle");
  setAct("actPeltier", actuators.peltier, "Cooling", "Idle");
  setAct("actFan", actuators.fan, "Circulating", "Off");
  setAct("actHum", actuators.humidifier, "Mist on", "Idle");
}

function setAct(id, on, onText, offText) {
  var el = document.getElementById(id);
  el.className = on ? "on" : "";
  el.querySelector("b").textContent = on ? onText : offText;
}

function renderSetpointDisplay() {
  document.getElementById("currentSetpoints").textContent =
    "Hysteresis: temperature ±" + TEMP_TOLERANCE + " °C, humidity ±" + HUM_TOLERANCE + "% RH.";
}

function addCell(row, text) {
  var cell = document.createElement("td");
  cell.textContent = text;
  row.appendChild(cell);
}

function renderLog() {
  var body = document.getElementById("logBody");
  body.innerHTML = "";
  var rows = [];
  for (var i = 0; i < readings.length; i++) {
    rows.push({ kind: "reading", time: readings[i].time, data: readings[i] });
  }
  for (var j = 0; j < events.length; j++) {
    rows.push({ kind: "event", time: events[j].time, data: events[j] });
  }
  rows.sort(function (a, b) { return b.time - a.time; });
  var shown = rows.slice(0, 250);
  for (var k = 0; k < shown.length; k++) {
    var row = shown[k];
    var tr = document.createElement("tr");
    if (row.kind === "event") {
      tr.className = "event-row";
      addCell(tr, formatTime(row.time));
      var cell = document.createElement("td");
      cell.colSpan = 13;
      cell.textContent = "Setpoint changed: " + row.data.label;
      tr.appendChild(cell);
    } else {
      var r = row.data;
      addCell(tr, formatTime(r.time));
      for (var s = 0; s < 4; s++) addCell(tr, showNumber(r.temps[s]));
      for (var h = 0; h < 4; h++) addCell(tr, showNumber(r.hums[h]));
      addCell(tr, showNumber(r.avgTemp));
      addCell(tr, showNumber(r.avgHum));
      addCell(tr, showNumber(r.uniT));
      addCell(tr, showNumber(r.uniH));
      addCell(tr, r.status);
      if (r.status === "Out of range") tr.className = "out-row";
    }
    body.appendChild(tr);
  }
}

function renderAlerts() {
  var list = document.getElementById("alertList");
  list.innerHTML = "";
  if (alerts.length === 0) {
    var empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No alerts yet.";
    list.appendChild(empty);
    return;
  }
  for (var i = 0; i < Math.min(alerts.length, 12); i++) {
    var li = document.createElement("li");
    li.textContent = formatTime(alerts[i].time) + " — " + alerts[i].message;
    list.appendChild(li);
  }
}

function makeDatasets(unit) {
  var sets = [];
  for (var s = 0; s < 4; s++) {
    var data = [];
    for (var i = 0; i < readings.length; i++) {
      var value = unit === "temp" ? readings[i].temps[s] : readings[i].hums[s];
      if (value !== null) data.push({ x: readings[i].time, y: value });
    }
    sets.push({
      label: "Sensor " + (s + 1),
      data: data,
      borderColor: SENSOR_COLORS[s],
      backgroundColor: SENSOR_COLORS[s],
      borderWidth: 2,
      tension: 0.3,
      pointRadius: readings.length > 40 ? 0 : 3,
      pointHoverRadius: 5,
      pointBackgroundColor: "#fffdf8",
      pointBorderColor: SENSOR_COLORS[s],
      pointBorderWidth: 2
    });
  }
  var avgData = [];
  for (var a = 0; a < readings.length; a++) {
    var avg = unit === "temp" ? readings[a].avgTemp : readings[a].avgHum;
    if (avg !== null) avgData.push({ x: readings[a].time, y: avg });
  }
  sets.push({
    label: "Average",
    data: avgData,
    borderColor: "#14261f",
    backgroundColor: "rgba(20, 38, 31, 0.06)",
    fill: true,
    borderWidth: 2.5,
    tension: 0.3,
    pointRadius: 0
  });
  return sets;
}

function eventLabel(event, unit) {
  if (unit === "temp" && event.newTemp !== event.oldTemp) {
    return event.oldTemp + " → " + event.newTemp + " °C";
  }
  if (unit !== "temp" && event.newHum !== event.oldHum) {
    return event.oldHum + " → " + event.newHum + " %";
  }
  return "";
}

function buildAnnotations(unit, spValue, tolerance) {
  var annotations = {
    band: {
      type: "box",
      yMin: spValue - tolerance,
      yMax: spValue + tolerance,
      backgroundColor: "rgba(61, 139, 99, 0.12)",
      borderColor: "rgba(61, 139, 99, 0.28)",
      borderWidth: 1
    },
    setpoint: {
      type: "line",
      yMin: spValue,
      yMax: spValue,
      borderColor: "#c9a227",
      borderWidth: 2,
      borderDash: [6, 4]
    }
  };
  for (var i = 0; i < events.length; i++) {
    var text = eventLabel(events[i], unit);
    annotations["event" + i] = {
      type: "line",
      xMin: events[i].time,
      xMax: events[i].time,
      borderColor: "#c45c26",
      borderWidth: 1.5,
      borderDash: [4, 4],
      label: {
        display: text !== "",
        content: text,
        position: "start",
        backgroundColor: "rgba(196, 92, 38, 0.9)",
        color: "#fff",
        font: { size: 10 }
      }
    };
  }
  return annotations;
}

function makeChartConfig(unit, yTitle, spValue, tolerance) {
  var unitText = unit === "temp" ? " °C" : " %";
  return {
    type: "line",
    data: { datasets: makeDatasets(unit) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          type: "linear",
          grace: "5%",
          title: { display: true, text: "Time", color: "#5d7268" },
          grid: { color: "rgba(217, 208, 189, 0.7)", drawTicks: false },
          ticks: {
            color: "#5d7268",
            maxTicksLimit: 6,
            callback: function (value) { return formatTime(value).slice(11, 16); }
          }
        },
        y: {
          grace: "8%",
          title: { display: true, text: yTitle, color: "#5d7268" },
          grid: { color: "rgba(217, 208, 189, 0.7)", drawTicks: false },
          ticks: { color: "#5d7268" }
        }
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8, color: "#14261f" }
        },
        tooltip: {
          callbacks: {
            title: function (items) {
              return items.length ? formatTime(items[0].parsed.x) : "";
            },
            label: function (item) {
              return item.dataset.label + ": " + item.parsed.y.toFixed(1) + unitText;
            }
          }
        },
        annotation: { annotations: buildAnnotations(unit, spValue, tolerance) }
      }
    }
  };
}

function renderCharts() {
  if (tempChart) tempChart.destroy();
  if (humChart) humChart.destroy();
  tempChart = new Chart(
    document.getElementById("tempChart"),
    makeChartConfig("temp", "Temperature (°C)", setpoints.temp, TEMP_TOLERANCE)
  );
  humChart = new Chart(
    document.getElementById("humChart"),
    makeChartConfig("humidity", "Relative humidity (%)", setpoints.hum, HUM_TOLERANCE)
  );
}

function renderAll() {
  renderStatus();
  renderKpis();
  renderChamber();
  renderActuators();
  renderSetpointDisplay();
  renderLog();
  renderAlerts();
  renderCharts();
}

function exportCSV() {
  if (readings.length === 0) {
    alert("There are no readings to export.");
    return;
  }
  var header = ["Time", "S1 Temp", "S2 Temp", "S3 Temp", "S4 Temp",
    "S1 Hum", "S2 Hum", "S3 Hum", "S4 Hum", "Avg Temp", "Avg Hum",
    "Temp range", "Hum range", "Status", "Source"];
  var lines = [header.join(",")];
  var sorted = readings.slice().sort(function (a, b) { return a.time - b.time; });
  for (var i = 0; i < sorted.length; i++) {
    var r = sorted[i];
    var row = [formatTime(r.time)];
    for (var t = 0; t < 4; t++) row.push(r.temps[t] === null ? "" : r.temps[t]);
    for (var h = 0; h < 4; h++) row.push(r.hums[h] === null ? "" : r.hums[h]);
    row.push(r.avgTemp === null ? "" : r.avgTemp.toFixed(2));
    row.push(r.avgHum === null ? "" : r.avgHum.toFixed(2));
    row.push(r.uniT === null ? "" : r.uniT.toFixed(2));
    row.push(r.uniH === null ? "" : r.uniH.toFixed(2));
    row.push(r.status);
    row.push(r.source || "");
    lines.push(row.join(","));
  }
  var blob = new Blob([lines.join("\n")], { type: "text/csv" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = "biopod_log.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  if (!confirm("Delete all readings, setpoints, alerts and events?")) return;
  stopDemo();
  readings = [];
  events = [];
  alerts = [];
  setpoints = { temp: 37, hum: 50 };
  metrics = {
    lastAdtSec: null,
    lastRtSec: null,
    disturbanceAt: null,
    outOfRangeAt: null,
    waitingForRecovery: false
  };
  actuators = { heater: false, peltier: false, fan: true, humidifier: false };
  document.getElementById("tempSetpoint").value = setpoints.temp;
  document.getElementById("humSetpoint").value = setpoints.hum;
  saveData();
  renderAll();
}

function markDisturbance() {
  metrics.disturbanceAt = Date.now();
  metrics.waitingForRecovery = true;
  metrics.lastRtSec = null;
  alerts.unshift({
    time: Date.now(),
    message: "Controlled disturbance marked (door open). Recovery timer started."
  });
  if (demoState) {
    demoState.temp -= 3.2;
    demoState.hum -= 8;
  }
  saveData();
  renderAll();
  showToast("Disturbance marked. Wait for return to ±0.5 °C / ±5% RH.");
}

function jitter(base, spread) {
  return base + (Math.random() * 2 - 1) * spread;
}

function demoTick() {
  demoState.tick += 1;
  demoState.temp += (setpoints.temp - demoState.temp) * 0.18 + jitter(0, 0.08);
  demoState.hum += (setpoints.hum - demoState.hum) * 0.12 + jitter(0, 0.35);
  if (demoState.tick === 18) {
    demoState.temp = 35.1;
    demoState.hum = 41;
  }
  var temps = [
    jitter(demoState.temp, 0.18),
    jitter(demoState.temp, 0.16),
    jitter(demoState.temp, 0.22),
    jitter(demoState.temp, 0.15)
  ];
  var hums = [
    jitter(demoState.hum, 0.8),
    jitter(demoState.hum, 0.9),
    jitter(demoState.hum, 1.1),
    jitter(demoState.hum, 0.7)
  ];
  updateActuatorsFromAverages(average(temps), average(hums));
  pushReading(temps, hums, Date.now(), "demo");
}

function startDemo() {
  if (demoTimer) return;
  demoState = { temp: 36.4, hum: 47.5, tick: 0 };
  document.getElementById("demoBtn").hidden = true;
  document.getElementById("stopDemoBtn").hidden = false;
  demoTick();
  demoTimer = setInterval(demoTick, 2000);
}

function stopDemo() {
  if (demoTimer) {
    clearInterval(demoTimer);
    demoTimer = null;
  }
  demoState = null;
  document.getElementById("demoBtn").hidden = false;
  document.getElementById("stopDemoBtn").hidden = true;
  renderStatus();
}

function showToast(message) {
  var el = document.getElementById("toast");
  el.hidden = false;
  el.textContent = message;
  clearTimeout(showToast.hideTimer);
  showToast.hideTimer = setTimeout(function () { el.hidden = true; }, 4200);
}

function ingestPayload(payload) {
  if (!payload || !payload.temps || !payload.hums) return;
  var incomingTime = payload.time || Date.now();
  for (var i = 0; i < readings.length; i++) {
    if (readings[i].source === "esp32" && readings[i].time === incomingTime) return;
  }
  var newest = readings.length ? readings[readings.length - 1].time : 0;
  if (incomingTime + 2000 < newest) return;
  if (payload.setpoints) {
    if (typeof payload.setpoints.temp === "number") setpoints.temp = payload.setpoints.temp;
    if (typeof payload.setpoints.hum === "number") setpoints.hum = payload.setpoints.hum;
    document.getElementById("tempSetpoint").value = setpoints.temp;
    document.getElementById("humSetpoint").value = setpoints.hum;
  }
  if (payload.actuators) {
    actuators = Object.assign(actuators, payload.actuators);
  } else {
    updateActuatorsFromAverages(average(payload.temps), average(payload.hums));
  }
  pushReading(payload.temps, payload.hums, incomingTime, "esp32");
}

function pollEsp32() {
  if (location.protocol === "file:") return;
  fetch("/api/reading", { cache: "no-store" })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data || !data.temps) return;
      if (data.id && pollEsp32.lastId === data.id) return;
      pollEsp32.lastId = data.id;
      ingestPayload(data);
    })
    .catch(function () {});
}

function init() {
  loadData();
  document.getElementById("readingTime").value = toInputValue(Date.now());
  document.getElementById("tempSetpoint").value = setpoints.temp;
  document.getElementById("humSetpoint").value = setpoints.hum;
  document.getElementById("addReadingBtn").addEventListener("click", addReading);
  document.getElementById("applySetpointBtn").addEventListener("click", applySetpoint);
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.getElementById("clearBtn").addEventListener("click", clearAll);
  document.getElementById("demoBtn").addEventListener("click", startDemo);
  document.getElementById("stopDemoBtn").addEventListener("click", stopDemo);
  document.getElementById("disturbBtn").addEventListener("click", markDisturbance);
  renderClock();
  setInterval(renderClock, 1000);
  pollTimer = setInterval(pollEsp32, 2000);
  pollEsp32();
  renderAll();
}

window.addEventListener("load", init);
