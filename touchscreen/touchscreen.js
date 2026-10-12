/* BioPod touchscreen UI logic. Standalone: does not depend on the dashboard's script.js.
   Live data comes from the same server (/api/reading, /api/log); with no server it runs a demo. */

var TEMP_TOL = 0.5;        // acceptance range, +/- C
var HUM_TOL = 5;           // acceptance range, +/- % RH
var TEMP_RANGE = [25, 45];
var HUM_RANGE = [20, 90];
var LIVE_WINDOW_MS = 15000;
var NO_DATA_DEMO_MS = 8000;

var sp = { temp: 37, hum: 50 };        // applied setpoints (server is the source of truth)
var draft = { temp: 37, hum: 50 };     // what the +/- buttons edit
var draftDirty = false;                // true while the user has un-applied edits
var latest = null;
var act = { heater: false, peltier: false, fan: true, humidifier: false };
var metrics = { adt: null, rt: null, outAt: null, distAt: null, distExceeded: false, waiting: false };
var lastAlert = "No alerts yet.";
var lc = null;
var lastLiveAt = 0;
var lastId = null;
var demo = null;
var setpointHoldUntil = 0;

function el(id) { return document.getElementById(id); }
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function num(v, d) { return (v === null || v === undefined || isNaN(v)) ? "—" : Number(v).toFixed(d === undefined ? 1 : d); }
function clamp(v, r) { return Math.min(r[1], Math.max(r[0], v)); }

function avg(list) {
  var s = 0, c = 0;
  for (var i = 0; i < list.length; i++) {
    if (list[i] !== null && list[i] !== undefined && !isNaN(list[i])) { s += list[i]; c++; }
  }
  return c ? s / c : null;
}

function inBand(t, h) {
  var tOk = t === null || Math.abs(t - sp.temp) <= TEMP_TOL;
  var hOk = h === null || Math.abs(h - sp.hum) <= HUM_TOL;
  return tOk && hOk;
}

/* ---------- toast ---------- */
function toast(msg) {
  var t = el("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(function () { t.hidden = true; }, 3200);
}

/* ---------- tabs ---------- */
function showView(name) {
  var views = document.querySelectorAll(".view");
  var tabs = document.querySelectorAll(".tab");
  for (var i = 0; i < views.length; i++) views[i].classList.toggle("active", views[i].id === "view-" + name);
  for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle("active", tabs[j].getAttribute("data-view") === name);
}

/* ---------- setpoint stepper (tap, or hold to repeat) ---------- */
function stepValue(target, dir) {
  if (target === "temp") draft.temp = clamp(Math.round((draft.temp + dir * 0.1) * 10) / 10, TEMP_RANGE);
  else draft.hum = clamp(Math.round(draft.hum + dir * 1), HUM_RANGE);
  draftDirty = true;
  renderSetpoints();
}

function bindStepper(btn) {
  var target = btn.getAttribute("data-target");
  var dir = Number(btn.getAttribute("data-dir"));
  var delay = null, repeat = null;
  function stop() { clearTimeout(delay); clearInterval(repeat); }
  function start(e) {
    e.preventDefault();
    stepValue(target, dir);
    delay = setTimeout(function () {
      repeat = setInterval(function () { stepValue(target, dir); }, 90);
    }, 400);
  }
  btn.addEventListener("pointerdown", start);
  ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { btn.addEventListener(ev, stop); });
}

function applySetpoints() {
  sp.temp = draft.temp;
  sp.hum = draft.hum;
  draftDirty = false;
  setpointHoldUntil = Date.now() + 15000;   // ignore stale echoes while the ESP32 catches up
  renderAll();
  if (location.protocol === "file:") { toast("Applied locally (no server)."); return; }
  fetch("/api/setpoints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ temp: sp.temp, hum: sp.hum })
  })
    .then(function (r) { toast(r.ok ? "Setpoints sent to BioPod." : "Rejected: outside safe range."); })
    .catch(function () { toast("Server unreachable. Not sent."); });
}

function resetSetpoints() {
  draft.temp = 37;
  draft.hum = 50;
  draftDirty = true;
  renderSetpoints();
}

/* ---------- alerts: ADT = Ta - To, RT = Tr - Td ---------- */
function handleLive(reading) {
  var ok = inBand(reading.avgT, reading.avgH);
  var now = Date.now();
  if (!ok) {
    if (metrics.waiting) metrics.distExceeded = true;
    if (metrics.outAt === null) {
      metrics.outAt = reading.time;
      metrics.adt = Math.max(0, (now - reading.time) / 1000);
      lastAlert = pad(new Date(now).getHours()) + ":" + pad(new Date(now).getMinutes()) +
        " Out of range: " + num(reading.avgT) + " °C / " + num(reading.avgH, 0) + "% RH";
      toast("Alert · " + lastAlert);
    }
  } else {
    if (metrics.waiting && metrics.distAt && metrics.distExceeded) {
      metrics.rt = Math.max(0, (reading.time - metrics.distAt) / 1000);
      metrics.waiting = false;
      metrics.distExceeded = false;
      metrics.distAt = null;
      lastAlert = "Recovered. RT = " + metrics.rt.toFixed(1) + " s";
    }
    metrics.outAt = null;
  }
}

function markDisturbance() {
  metrics.distAt = Date.now();
  metrics.distExceeded = false;
  metrics.waiting = true;
  metrics.rt = null;
  lastAlert = "Door disturbance marked. Timer running.";
  if (demo) { demo.temp -= 3.2; demo.hum -= 8; }
  renderStatus();
  toast("Disturbance marked.");
}

/* ---------- ingest ---------- */
function ingest(temps, hums, time, actuators, setpoints, isDemo) {
  latest = { temps: temps, hums: hums, avgT: avg(temps), avgH: avg(hums), time: time, demo: !!isDemo };
  lastLiveAt = Date.now();
  if (actuators) act = Object.assign(act, actuators);
  if (setpoints && Date.now() > setpointHoldUntil) {
    if (typeof setpoints.temp === "number") sp.temp = setpoints.temp;
    if (typeof setpoints.hum === "number") sp.hum = setpoints.hum;
  }
  if (Math.abs(Date.now() - time) < LIVE_WINDOW_MS) handleLive(latest);
  renderAll();
}

function poll() {
  if (location.protocol === "file:") return;
  fetch("/api/reading", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.temps) return;
      if (d.id && lastId === d.id) return;
      lastId = d.id;
      if (demo) stopDemo();
      ingest(d.temps, d.hums, d.time || Date.now(), d.actuators, d.setpoints, false);
    })
    .catch(function () {});
}

function pollLog() {
  if (location.protocol === "file:") return;
  fetch("/api/log", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.expected > 0) { lc = (d.valid / d.expected) * 100; renderStatus(); }
    })
    .catch(function () {});
}

/* ---------- demo mode (no server / no ESP32) ---------- */
function jit(base, spread) { return base + (Math.random() * 2 - 1) * spread; }

function demoTick() {
  demo.tick++;
  demo.temp += (sp.temp - demo.temp) * 0.18 + jit(0, 0.08);
  demo.hum += (sp.hum - demo.hum) * 0.12 + jit(0, 0.35);
  var temps = [jit(demo.temp, 0.18), jit(demo.temp, 0.16), jit(demo.temp, 0.22), jit(demo.temp, 0.15)];
  var hums = [jit(demo.hum, 0.8), jit(demo.hum, 0.9), jit(demo.hum, 1.1), jit(demo.hum, 0.7)];
  var t = avg(temps), h = avg(hums);
  if (!act.heater && t < sp.temp - 0.2) act.heater = true;
  else if (act.heater && t >= sp.temp + 0.2) act.heater = false;
  if (!act.peltier && t > sp.temp + TEMP_TOL) act.peltier = true;
  else if (act.peltier && t <= sp.temp + 0.2) act.peltier = false;
  if (!act.humidifier && h < sp.hum - 2) act.humidifier = true;
  else if (act.humidifier && h >= sp.hum + 2) act.humidifier = false;
  ingest(temps, hums, Date.now(), null, null, true);
}

function startDemo() {
  if (demo) return;
  demo = { temp: 36.4, hum: 47.5, tick: 0, timer: null };
  demoTick();
  demo.timer = setInterval(demoTick, 2000);
}

function stopDemo() {
  if (!demo) return;
  clearInterval(demo.timer);
  demo = null;
}

function watchForData() {
  if (!demo && Date.now() - lastLiveAt > NO_DATA_DEMO_MS) startDemo();
}

/* ---------- render ---------- */
function renderClock() {
  var n = new Date();
  el("clock").textContent = pad(n.getHours()) + ":" + pad(n.getMinutes());
}

function renderPill() {
  var pill = el("pill");
  var text = el("pillText");
  pill.className = "pill";
  if (!latest) { text.textContent = "Standby"; return; }
  pill.classList.add("live");
  text.textContent = latest.demo ? "Demo" : "Linked";
  if (!inBand(latest.avgT, latest.avgH)) pill.classList.add("alert");
}

function renderHome() {
  var banner = el("banner");
  el("noteT").textContent = "Setpoint " + sp.temp.toFixed(1) + " ± " + TEMP_TOL;
  el("noteH").textContent = "Setpoint " + sp.hum.toFixed(0) + " ± " + HUM_TOL;
  if (!latest) {
    banner.className = "banner";
    el("bannerKicker").textContent = "Chamber status";
    el("bannerText").textContent = "Waiting for readings…";
  } else {
    var ok = inBand(latest.avgT, latest.avgH);
    banner.className = "banner " + (ok ? "in" : "out");
    el("bannerKicker").textContent = ok ? "In range" : "Out of range";
    el("bannerText").textContent = ok
      ? "Holding near " + sp.temp.toFixed(1) + " °C / " + sp.hum.toFixed(0) + "% RH."
      : "Outside the ±" + TEMP_TOL + " °C / ±" + HUM_TOL + "% RH range.";
  }
  el("avgT").textContent = latest ? num(latest.avgT) : "—";
  el("avgH").textContent = latest ? num(latest.avgH) : "—";

  for (var i = 0; i < 4; i++) {
    var zone = el("zone" + (i + 1));
    if (!latest) {
      zone.className = "zone";
      el("z" + (i + 1) + "t").textContent = "—";
      el("z" + (i + 1) + "h").textContent = "— % RH";
      continue;
    }
    var t = latest.temps[i], h = latest.hums[i];
    el("z" + (i + 1) + "t").textContent = num(t) + "°";
    el("z" + (i + 1) + "h").textContent = num(h) + "% RH";
    var good = (t === null || Math.abs(t - sp.temp) <= TEMP_TOL) && (h === null || Math.abs(h - sp.hum) <= HUM_TOL);
    zone.className = "zone " + (good ? "in" : "out");
  }

  el("chipHeater").classList.toggle("on", !!act.heater);
  el("chipPeltier").classList.toggle("on", !!act.peltier);
  el("chipFan").classList.toggle("on", !!act.fan);
  el("chipHum").classList.toggle("on", !!act.humidifier);
}

function renderSetpoints() {
  el("setT").textContent = draft.temp.toFixed(1);
  el("setH").textContent = draft.hum.toFixed(0);
  el("setHint").textContent = draftDirty
    ? "Not applied yet. Tap Apply setpoints."
    : "Acceptance ±0.5 °C / ±5 % RH · hysteresis ±0.2 °C";
}

function setAct(id, on, onText, offText) {
  var li = el(id);
  li.className = on ? "on" : "";
  li.querySelector("b").textContent = on ? onText : offText;
}

function renderStatus() {
  setAct("actHeater", act.heater, "Heating", "Idle");
  setAct("actPeltier", act.peltier, "Cooling", "Idle");
  setAct("actFan", act.fan, "Circulating", "Off");
  setAct("actHum", act.humidifier, "Mist on", "Idle");
  el("kLc").textContent = lc === null ? "—" : num(lc, 0);
  el("kAdt").textContent = metrics.adt === null ? "—" : num(metrics.adt, 1);
  el("kRt").textContent = metrics.rt === null ? "—" : num(metrics.rt, 1);
  el("alertText").textContent = lastAlert;
}

function renderAll() {
  // follow setpoints changed elsewhere (web dashboard) unless the user is mid-edit
  if (!draftDirty) {
    draft.temp = sp.temp;
    draft.hum = sp.hum;
  }
  renderPill();
  renderHome();
  renderSetpoints();
  renderStatus();
}

/* ---------- init ---------- */
function init() {
  var tabs = document.querySelectorAll(".tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", (function (t) {
      return function () { showView(t.getAttribute("data-view")); };
    })(tabs[i]));
  }
  var steps = document.querySelectorAll(".step");
  for (var j = 0; j < steps.length; j++) bindStepper(steps[j]);

  el("applyBtn").addEventListener("click", applySetpoints);
  el("resetBtn").addEventListener("click", resetSetpoints);
  el("disturbBtn").addEventListener("click", markDisturbance);

  renderClock();
  setInterval(renderClock, 1000);
  setInterval(poll, 2000);
  setInterval(pollLog, 15000);
  setInterval(watchForData, 2000);
  poll();
  pollLog();
  renderAll();
}

window.addEventListener("load", init);
