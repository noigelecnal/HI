// ---------------------------------------------------------------------------
// Sensor data sources
//
// A source is an object: { kind, subscribe(listener) -> unsubscribe }.
// The listener receives either
//   { temperatureC, humidity, timestamp }   a reading
//   { error: 'message' }                     a failure
//
// The UI only knows this interface, so swapping simulated data for a real
// ESP32 means changing SENSOR_CONFIG below (see README), not the UI.
// ---------------------------------------------------------------------------

export const SENSOR_CONFIG = {
  // 'simulated' | 'http' | 'none'
  type: 'simulated',
  simulated: { intervalMs: 2000 },
  http: {
    url: null, // e.g. 'http://192.168.1.50/readings' once your ESP32 serves one
    intervalMs: 2000,
    // JSON field names in the response body
    fields: { temperature: 'temperature', humidity: 'humidity' },
  },
  // A reading older than this is shown as "stale"
  staleAfterMs: 8000,
}

function gaussian() {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Smooth mean-reverting random walk: no unrealistic jumps between samples.
export function createSimulatedSource({ intervalMs }) {
  return {
    kind: 'simulated',
    subscribe(listener) {
      let temperature = 22.5
      let humidity = 55
      const emit = () => {
        listener({
          temperatureC: Number(temperature.toFixed(1)),
          humidity: Number(humidity.toFixed(1)),
          timestamp: Date.now(),
        })
      }
      emit()
      const id = setInterval(() => {
        temperature = clamp(temperature + (22.5 - temperature) * 0.04 + gaussian() * 0.06, 18, 28)
        humidity = clamp(humidity + (55 - humidity) * 0.04 + gaussian() * 0.25, 35, 75)
        emit()
      }, intervalMs)
      return () => clearInterval(id)
    },
  }
}

// Polls a JSON endpoint. Only created when a URL has been configured.
export function createHttpSource({ url, intervalMs, fields }) {
  return {
    kind: 'http',
    subscribe(listener) {
      let controller = null
      const poll = async () => {
        controller?.abort()
        controller = new AbortController()
        try {
          const res = await fetch(url, { signal: controller.signal })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const body = await res.json()
          const temperatureC = Number(body[fields.temperature])
          const humidity = Number(body[fields.humidity])
          if (!Number.isFinite(temperatureC) || !Number.isFinite(humidity)) {
            throw new Error('Response is missing temperature or humidity')
          }
          listener({ temperatureC, humidity, timestamp: Date.now() })
        } catch (err) {
          if (err.name !== 'AbortError') listener({ error: err.message })
        }
      }
      poll()
      const id = setInterval(poll, intervalMs)
      return () => {
        clearInterval(id)
        controller?.abort()
      }
    },
  }
}

export function createSensorSource(config = SENSOR_CONFIG) {
  if (config.type === 'simulated') return createSimulatedSource(config.simulated)
  if (config.type === 'http' && config.http.url) return createHttpSource(config.http)
  return null // nothing configured: the UI shows a disconnected state
}
