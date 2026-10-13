
export const MODEL_CONFIG = {
  productName: 'Sample Container',
  tagline:
    'change this ion the modelConfig',
  revision: 'Rev A',


  glbUrl: '/models/container.glb',

  animation: {
    openClips: ['Open', 'LidOpen', 'Lid_Open', 'OpenContainer', 'Opening'],
    closeClips: ['Close', 'LidClose', 'Lid_Close', 'CloseContainer', 'Closing'],
    lidFallback: { axis: 'x', angleDeg: 110, direction: -1 },
  },

  camera: {
    position: [1, 0.0, 1.5],
    target: [0, 0, 0],
    fov: 50,
    minDistance: 0,
    maxDistance: 7,
  },
}

// Each entry maps a friendly UI component to the object name(s) in the model.
//  - meshNames:     Blender object names to look for (first match wins)
//  - explodeOffset: [x, y, z] offset in model units when exploded view is on
//  - labelAnchor:   [x, y, z] position of the 3D marker, local to the component
export const COMPONENTS = [
  {
    id: 'body',
    label: 'Container body',
    meshNames: ['ContainerBody', 'Body', 'Container'],
    description: 'Open-top shell that holds the tray and the sensor module. Walls are 8 mm thick in the model.',
    explodeOffset: [0, -0.45, 0],
    labelAnchor: [1.2, 0.5, 0.2],
  },
  {
    id: 'lid',
    label: 'Lid',
    meshNames: ['Lid', 'Cover', 'Top'],
    description: 'Hinged cover. In the model its origin sits on the hinge line so it rotates open about the rear edge.',
    explodeOffset: [0, 1.7, 0],
    labelAnchor: [0.8, 0.1, 1.3],
  },
  {
    id: 'tray',
    label: 'Inner tray',
    meshNames: ['InnerTray', 'Tray', 'Inner_Tray'],
    description: 'Removable divided tray that rests on the floor of the container.',
    explodeOffset: [0, 0.1, 0],
    labelAnchor: [0, 0.16, 0.5],
  },
  {
    id: 'sensor',
    label: 'Sensor module',
    meshNames: ['SensorModule', 'Sensor', 'Sensor_Module'],
    description: 'Temperature and humidity board mounted on the inner rear wall. Readings appear in the dashboard.',
    explodeOffset: [0, 0.2, 0.1],
    labelAnchor: [0, 0.22, 0.06],
  },
    {
    id: 'PetriDish',
    label: 'Petridish',
    meshNames: ['SensorModule', 'Sensor', 'Sensor_Module'],
    description: 'Change this in ModelConfig',
    explodeOffset: [0.1, 0.6, -0.4],
    labelAnchor: [0, 0.22, 0.06],
  },
]

export const HIGHLIGHT_COLOR = '#2f5d50'
