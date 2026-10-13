import { Layers, Lock, LockOpen, RotateCcw } from 'lucide-react'

const MOTION_LABEL = {
  closed: 'Closed',
  opening: 'Opening',
  open: 'Open',
  closing: 'Closing',
  partial: 'Partly open',
}

export default function ViewerControls({ motion, openTarget, onOpenTarget, exploded, onToggleExploded, onResetCamera, canAnimate }) {
  const isOpenish = openTarget > 0.5
  return (
    <div className="controls" role="group" aria-label="Model controls">
      <div className="controls-row">
        <button type="button" className="btn primary" onClick={() => onOpenTarget(1)} disabled={!canAnimate || openTarget === 1}>
          <LockOpen size={16} aria-hidden /> Open container
        </button>
        <button type="button" className="btn" onClick={() => onOpenTarget(0)} disabled={!canAnimate || openTarget === 0}>
          <Lock size={16} aria-hidden /> Close container
        </button>
        <button type="button" className={`btn${exploded ? ' is-on' : ''}`} aria-pressed={exploded} onClick={onToggleExploded}>
          <Layers size={16} aria-hidden /> Exploded view
        </button>
        <button type="button" className="btn ghost" onClick={onResetCamera}>
          <RotateCcw size={16} aria-hidden /> Reset camera
        </button>
      </div>

      <label className="slider">
        <span className="field-label">Lid position</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={openTarget}
          onChange={(e) => onOpenTarget(Number(e.target.value))}
          disabled={!canAnimate}
          aria-valuetext={isOpenish ? 'towards open' : 'towards closed'}
        />
        <span className="slider-state" aria-live="polite">
          {canAnimate ? MOTION_LABEL[motion] : 'Unavailable'}
        </span>
      </label>
    </div>
  )
}
