import { Eye, EyeOff } from 'lucide-react'
import { COMPONENTS } from '../config/modelConfig'

export default function ComponentPanel({ found, hiddenIds, selectedId, onSelect, onToggleHidden, onShowAll }) {
  const anyHidden = hiddenIds.size > 0
  return (
    <section className="panel" aria-labelledby="components-title">
      <div className="card-head">
        <h2 id="components-title" className="panel-title">Components</h2>
        <button type="button" className="link-btn" onClick={onShowAll} disabled={!anyHidden}>
          Show all
        </button>
      </div>
      <ul className="component-list">
        {COMPONENTS.map((c) => {
          const present = Boolean(found[c.id])
          const hidden = hiddenIds.has(c.id)
          const selected = selectedId === c.id
          return (
            <li key={c.id} className={`component-row${selected ? ' is-selected' : ''}${hidden ? ' is-hidden' : ''}`}>
              <button
                type="button"
                className="component-name"
                onClick={() => onSelect(c.id)}
                aria-pressed={selected}
                disabled={!present}
              >
                {c.label}
                {!present && <span className="muted"> · not in model</span>}
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => onToggleHidden(c.id)}
                disabled={!present}
                aria-label={`${hidden ? 'Show' : 'Hide'} ${c.label}`}
                aria-pressed={hidden}
              >
                {hidden ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
