import { COMPONENTS } from '../config/modelConfig'

export default function ComponentInfo({ selectedId, found, hiddenIds }) {
  const def = COMPONENTS.find((c) => c.id === selectedId)
  return (
    <section className="panel" aria-labelledby="info-title" aria-live="polite">
      <h2 id="info-title" className="panel-title">Selected component</h2>
      {def ? (
        <>
          <p className="info-title">{def.label}</p>
          <p className="info-body">{def.description}</p>
          <dl className="info-meta">
            <div>
              <dt>Model object</dt>
              <dd>{found[def.id] ?? '—'}</dd>
            </div>
            <div>
              <dt>Visibility</dt>
              <dd>{hiddenIds.has(def.id) ? 'Hidden' : 'Visible'}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="info-body muted">Select a component from the list or click a marker on the model.</p>
      )}
    </section>
  )
}
