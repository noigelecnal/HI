import { Droplets, Thermometer } from 'lucide-react'

const STATUS = {
  live: { label: 'Live', tone: 'ok' },
  simulated: { label: 'Simulated', tone: 'sim' },
  stale: { label: 'Stale', tone: 'warn' },
  unavailable: { label: 'Unavailable', tone: 'off' },
}

const formatAge = (ms) => {
  if (ms == null) return '—'
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 2 ? 'just now' : `${s}s ago`
}

export default function SensorDashboard({ sensor, simulationOn, onToggleSimulation }) {
  const { reading, dataStatus, connection, error, ageMs, kind } = sensor
  const status = STATUS[dataStatus]
  const show = (v, digits = 1) => (reading ? v.toFixed(digits) : '—')

  return (
    <section className="panel" aria-labelledby="sensor-title">
      <div className="card-head">
        <h2 id="sensor-title" className="panel-title">Environment</h2>
        <span className={`badge badge-${status.tone}`}>{status.label}</span>
      </div>

      <div className="readings">
        <div className="reading">
          <Thermometer size={16} aria-hidden />
          <span className="reading-value">{show(reading?.temperatureC)}<small>°C</small></span>
          <span className="reading-label">Temperature</span>
        </div>
        <div className="reading">
          <Droplets size={16} aria-hidden />
          <span className="reading-value">{show(reading?.humidity)}<small>%</small></span>
          <span className="reading-label">Relative humidity</span>
        </div>
      </div>

      <dl className="info-meta">
        <div>
          <dt>Sensor connection</dt>
          <dd>{connection === 'connected' ? 'Connected' : 'Not connected'}</dd>
        </div>
        <div>
          <dt>Last update</dt>
          <dd>
            {reading ? `${new Date(reading.timestamp).toLocaleTimeString()} · ${formatAge(ageMs)}` : '—'}
          </dd>
        </div>
      </dl>

      {kind === 'simulated' && (
        <p className="note">Values are generated for development. No hardware sensor is connected.</p>
      )}
      {error && <p className="note note-warn">Sensor error: {error}</p>}

      <label className="switch">
        <input type="checkbox" checked={simulationOn} onChange={(e) => onToggleSimulation(e.target.checked)} />
        <span>Simulated feed</span>
      </label>
    </section>
  )
}
