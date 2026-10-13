import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { TriangleAlert } from 'lucide-react'
import './App.css'
import { COMPONENTS, MODEL_CONFIG } from './config/modelConfig'
import { useSensorData } from './hooks/useSensorData'
import Viewer3D from './components/Viewer3D'
import ViewerControls from './components/ViewerControls'
import ComponentPanel from './components/ComponentPanel'
import ComponentInfo from './components/ComponentInfo'
import SensorDashboard from './components/SensorDashboard'
import ModelMap from './components/ModelMap'

const EMPTY_INFO = { mode: 'none', clips: [], found: {} }

const MOTION_TEXT = {
  closed: 'Closed',
  opening: 'Opening…',
  open: 'Open',
  closing: 'Closing…',
  partial: 'Partly open',
}

function LoadingOverlay() {
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <div className="overlay" role="status">
      Loading model… {Math.round(progress)}%
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="clock">{now.toLocaleTimeString([], { hour12: false })}</span>
}

export default function App() {
  const [openTarget, setOpenTarget] = useState(0)
  const [motion, setMotion] = useState('closed')
  const [exploded, setExploded] = useState(false)
  const [hiddenIds, setHiddenIds] = useState(() => new Set())
  const [selectedId, setSelectedId] = useState(null)
  const [resetCount, setResetCount] = useState(0)
  const [info, setInfo] = useState(EMPTY_INFO)
  const [modelError, setModelError] = useState(null)
  const [simulationOn, setSimulationOn] = useState(true)

  const sensor = useSensorData({ enabled: simulationOn })

  const toggleHidden = useCallback((id) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const showAll = useCallback(() => setHiddenIds(new Set()), [])
  const select = useCallback((id) => setSelectedId((prev) => (prev === id ? null : id)), [])
  const handleModelError = useCallback((err) => setModelError(err?.message ?? 'Unknown error'), [])

  const modelProps = useMemo(
    () => ({ openTarget, exploded, hiddenIds, selectedId, onSelect: select, onInfo: setInfo, onMotion: setMotion }),
    [openTarget, exploded, hiddenIds, selectedId, select],
  )

  const canAnimate = info.mode !== 'none'
  const usingPlaceholder = !MODEL_CONFIG.glbUrl || Boolean(modelError)
  const selected = COMPONENTS.find((c) => c.id === selectedId)
  const lidText = canAnimate ? MOTION_TEXT[motion] : 'No lid animation'
  const lidIsClosed = !canAnimate || motion === 'closed'
  const reading = sensor.reading

  const pill =
    sensor.connection === 'connected'
      ? { cls: 'live', text: 'Sensor connected' }
      : sensor.kind === 'simulated'
        ? { cls: '', text: 'Simulated readings' }
        : { cls: 'alert', text: 'No sensor connected' }

  const sourceNote =
    sensor.dataStatus === 'simulated'
      ? 'Simulated, not measured'
      : sensor.dataStatus === 'live'
        ? 'Live from sensor'
        : sensor.dataStatus === 'stale'
          ? 'Stale reading'
          : 'No data source'

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="mark" aria-hidden>
            <span className="mark-ring" />
            <span className="mark-core" />
          </div>
          <div>
            <p className="eyebrow">3D product viewer</p>
            <h1>{MODEL_CONFIG.productName}</h1>
            <p className="tagline">{MODEL_CONFIG.tagline}</p>
          </div>
        </div>
        <span />
        <div className="top-meta">
          <div className={`live-pill ${pill.cls}`} title="Hardware sensor connection">
            <span className="dot" aria-hidden />
            <span>{pill.text}</span>
          </div>
          <Clock />
        </div>
      </header>

      <section className={`status-banner ${lidIsClosed ? 'in' : 'out'}`} aria-live="polite">
        <div>
          <p className="status-kicker">Container status</p>
          <p className="status-copy">
            Lid {lidText.toLowerCase()} · {exploded ? 'exploded view' : 'assembled'}
            {reading && ` · ${reading.temperatureC.toFixed(1)} °C / ${reading.humidity.toFixed(1)}% RH (${sensor.kind === 'simulated' ? 'simulated' : 'sensor'})`}
          </p>
        </div>
      </section>

      <section className="kpi-grid" aria-label="Summary">
        <div className="kpi">
          <p className="kpi-label">Temperature</p>
          <p className="kpi-value">{reading ? reading.temperatureC.toFixed(1) : '—'}<small>°C</small></p>
          <p className="kpi-note">{sourceNote}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Humidity</p>
          <p className="kpi-value">{reading ? reading.humidity.toFixed(1) : '—'}<small>% RH</small></p>
          <p className="kpi-note">{sourceNote}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Lid</p>
          <p className="kpi-value">{canAnimate ? MOTION_TEXT[motion].replace('…', '') : '—'}</p>
          <p className="kpi-note">{Math.round(openTarget * 100)}% target</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">View</p>
          <p className="kpi-value">{exploded ? 'Exploded' : 'Assembled'}</p>
          <p className="kpi-note">Toggle below the model</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Hidden parts</p>
          <p className="kpi-value">{hiddenIds.size}<small>of {COMPONENTS.length}</small></p>
          <p className="kpi-note">Use the eye icons</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Selected</p>
          <p className="kpi-value">{selected ? selected.label : '—'}</p>
          <p className="kpi-note">Click a marker or list item</p>
        </div>
      </section>

      <div className="main-grid">
        <section className="panel" aria-labelledby="viewer-title">
          <div className="panel-head">
            <h2 id="viewer-title" className="panel-title">Interactive model</h2>
            <p>Drag to rotate · scroll or pinch to zoom · click a marker to inspect a part</p>
          </div>

          <div className="viewer">
            <Viewer3D modelProps={modelProps} resetCount={resetCount} onModelError={handleModelError} />
            <LoadingOverlay />
            <span className="tag tag-state">{lidText}</span>
            {usingPlaceholder && <span className="tag tag-model">Placeholder model</span>}
          </div>

          {modelError && (
            <p className="banner" role="alert">
              <TriangleAlert size={16} aria-hidden /> Could not load {MODEL_CONFIG.glbUrl}: {modelError}. Showing the placeholder instead.
            </p>
          )}
          {!canAnimate && (
            <p className="banner" role="alert">
              <TriangleAlert size={16} aria-hidden /> This model has no opening animation and no lid object matching the configured names, so open/close is disabled.
            </p>
          )}

          <ViewerControls
            motion={motion}
            openTarget={openTarget}
            onOpenTarget={setOpenTarget}
            exploded={exploded}
            onToggleExploded={() => setExploded((v) => !v)}
            onResetCamera={() => setResetCount((n) => n + 1)}
            canAnimate={canAnimate}
          />
        </section>

        <aside className="side">
          <ComponentPanel
            found={info.found}
            hiddenIds={hiddenIds}
            selectedId={selectedId}
            onSelect={select}
            onToggleHidden={toggleHidden}
            onShowAll={showAll}
          />
          <ComponentInfo selectedId={selectedId} found={info.found} hiddenIds={hiddenIds} />
        </aside>
      </div>

      <div className="lower-grid">
        <SensorDashboard sensor={sensor} simulationOn={simulationOn} onToggleSimulation={setSimulationOn} />
        <ModelMap found={info.found} mode={info.mode} clips={info.clips} />
      </div>

      <footer className="footer">
        <span>
          {MODEL_CONFIG.productName} · {MODEL_CONFIG.revision} · {usingPlaceholder ? 'placeholder model' : MODEL_CONFIG.glbUrl}
        </span>
        <span>
          {sensor.kind === 'simulated'
            ? 'Environment readings are simulated, not measured.'
            : sensor.kind === 'http'
              ? 'Environment readings come from the configured sensor endpoint.'
              : 'No sensor data source is active.'}
        </span>
      </footer>
    </div>
  )
}
