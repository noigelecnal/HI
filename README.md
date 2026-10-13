# Container Showcase

Interactive 3D container viewer: open/close lid, exploded view, component visibility, clickable 3D markers and a temperature/humidity panel.
React + Vite + Three.js + React Three Fiber + Drei + Lucide.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build
npm run verify     # headless browser test (needs Playwright + Chromium, run build first)
```

Right now a **procedural placeholder container** is shown. Sensor values are **simulated** and labelled as such.

## Where things live

| File | Purpose |
| --- | --- |
| `src/config/modelConfig.js` | GLB path, animation clip names, component → Blender object mapping, exploded offsets, marker positions |
| `src/components/ContainerModel.jsx` | Shared rig: finds parts, open/close, exploded view, highlight, visibility |
| `src/components/DemoContainer.jsx` | The placeholder model (object names match the config) |
| `src/components/BlenderModel.jsx` | Loads the real GLB when `glbUrl` is set |
| `src/services/sensorService.js` | Sensor sources (simulated, HTTP polling) |
| `src/hooks/useSensorData.js` | Turns a source into display state (live / simulated / stale / unavailable) |

## Swapping in the Blender model

1. Put the file at `public/models/container.glb` (create the `public/models` folder).
2. In `modelConfig.js` set `glbUrl: '/models/container.glb'`.
3. Name your Blender objects as listed below, or add your names to each component's `meshNames`.

Names the site looks for (first match wins):

| Component | Blender object names |
| --- | --- |
| Container body | `ContainerBody`, `Body`, `Container` |
| Lid | `Lid`, `Cover`, `Top` |
| Hinge | `Hinge`, `HingePin`, `Hinge_Pin` |
| Inner tray | `InnerTray`, `Tray`, `Inner_Tray` |
| Sensor module | `SensorModule`, `Sensor`, `Sensor_Module` |

Animation clips (case-insensitive): open = `Open`, `LidOpen`, `Lid_Open`, `OpenContainer`, `Opening`; close = `Close`, `LidClose`, `Lid_Close`, `CloseContainer`, `Closing`.
The site uses the open clip scrubbed forwards and backwards, so one clip is enough. Detected clip names show in the footer.

### Blender export checklist

1. Make each part its own top-level object (lid, body, hinge, tray, sensor), not merged into one mesh. Keep them unparented from each other so hiding and exploding one never moves another.
2. Lid pivot: put the lid's **origin on the hinge line** (Object > Set Origin > Origin to 3D Cursor, with the cursor on the hinge edge). Without this, the fallback rotation swings around the wrong point.
3. Animation: in the Action Editor, key the lid rotation at frame 1 (closed) and frame 30 (open). Name the action `Open`. Push it down to an NLA strip or keep it as the object's action.
4. Apply scale and rotation (Ctrl+A) on every object; use metres, +Y up (the glTF exporter converts from Blender's Z up).
5. File > Export > glTF 2.0 (.glb): Format `glTF Binary`, enable Animation, and under Animation turn on "Always Sample Animations" and "Export all actions" if you have more than one. Include Materials.
6. If the GLB has no matching clip, the site rotates the `Lid` object 110° about its origin instead (`animation.lidFallback`). If there is no lid object either, open/close is disabled and a banner says so.
7. Update `labelAnchor` and `explodeOffset` in the config for your model's size. Both are in model units.

## Replacing simulated data with a real ESP32

The UI never talks to hardware directly. In `src/services/sensorService.js`:

1. Make the ESP32 serve JSON, e.g. `{"temperature": 23.4, "humidity": 51.2}`, with CORS allowed (`Access-Control-Allow-Origin: *`). If the site is served over https, the endpoint must be https too.
2. Set `SENSOR_CONFIG.type` to `'http'` and `SENSOR_CONFIG.http.url` to your endpoint. Adjust `fields` if your keys differ.
3. The header then shows "connected" only after a successful response. Readings older than `staleAfterMs` show as stale, and failures show the error message.

For WebSocket, add a `createWebSocketSource` that returns `{ kind: 'http'|'websocket', subscribe }` and calls the listener with `{ temperatureC, humidity, timestamp }`. Note `useSensorData` treats kind `'http'` as the real-hardware kind, so add your new kind there too.
