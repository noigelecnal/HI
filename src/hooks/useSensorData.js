import { useEffect, useState } from 'react'
import { SENSOR_CONFIG, createSensorSource } from '../services/sensorService'

// Returns display-ready sensor state.
//   connection: 'connected' | 'disconnected'   (real hardware link only)
//   dataStatus: 'live' | 'simulated' | 'stale' | 'unavailable'
export function useSensorData({ enabled = true } = {}) {
  const [kind, setKind] = useState('none')
  const [reading, setReading] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const source = createSensorSource(enabled ? SENSOR_CONFIG : { type: 'none' })
    setReading(null)
    setError(null)
    setKind(source ? source.kind : 'none')
    if (!source) return undefined

    return source.subscribe((msg) => {
      if (msg.error) {
        setError(msg.error)
      } else {
        setError(null)
        setReading(msg)
      }
    })
  }, [enabled])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const ageMs = reading ? now - reading.timestamp : null
  let dataStatus = 'unavailable'
  if (reading) {
    if (ageMs > SENSOR_CONFIG.staleAfterMs) dataStatus = 'stale'
    else dataStatus = kind === 'simulated' ? 'simulated' : 'live'
  }

  return {
    kind,
    reading,
    error,
    ageMs,
    dataStatus,
    connection: kind === 'http' && reading && !error ? 'connected' : 'disconnected',
  }
}
