import { COMPONENTS } from '../config/modelConfig'

export default function ModelMap({ found, mode, clips }) {
  const modeText = { clips: 'Model animation clip', 'lid-rotation': 'Lid rotation fallback', none: 'None available' }[mode]
  return (
    <section className="panel" aria-labelledby="map-title">
      <div className="panel-head">
        <h2 id="map-title" className="panel-title">Model mapping</h2>
        <p>How each part is matched to an object in the 3D file. Edit names in <code>modelConfig.js</code>.</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Component</th><th>Looks for</th><th>Found</th></tr>
          </thead>
          <tbody>
            {COMPONENTS.map((c) => (
              <tr key={c.id} className={found[c.id] ? '' : 'out-row'}>
                <td>{c.label}</td>
                <td>{c.meshNames.join(', ')}</td>
                <td>{found[c.id] ?? 'Missing'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="footnote">
        Lid animation: {modeText}
        {clips.length > 0 && <> · clips <code>{clips.join(', ')}</code></>}
      </p>
    </section>
  )
}
