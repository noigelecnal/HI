import { useMemo } from 'react'
import * as THREE from 'three'
import ContainerModel from './ContainerModel'

// Procedural placeholder. Object names match the defaults in modelConfig.js,
// and the lid origin sits on the hinge line exactly as the Blender model should.

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra })

function box(size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function named(name, position) {
  const group = new THREE.Group()
  group.name = name
  group.position.set(...position)
  return group
}

export function buildDemoRoot() {
  const root = new THREE.Group()
  root.name = 'PlaceholderContainer'

  // Body: floor + four walls, open at the top (spans y 0..1)
  const bodyMat = mat('#e8e8e4')
  const body = named('ContainerBody', [0, 0, 0])
  body.add(
    box([2.4, 0.08, 1.6], [0, 0.04, 0], bodyMat),
    box([2.4, 0.92, 0.08], [0, 0.54, 0.76], bodyMat),
    box([2.4, 0.92, 0.08], [0, 0.54, -0.76], bodyMat),
    box([0.08, 0.92, 1.44], [1.16, 0.54, 0], bodyMat),
    box([0.08, 0.92, 1.44], [-1.16, 0.54, 0], bodyMat),
  )

  // Lid: origin on the rear hinge line, panel extends toward +z
  const lid = named('Lid', [0, 1.0, -0.8])
  lid.add(box([2.5, 0.08, 1.7], [0, 0.04, 0.8], mat('#d6dad6')))
  lid.add(box([0.5, 0.05, 0.1], [0, 0.1, 1.5], mat('#2f5d50')))



  // Inner tray with dividers
  const trayMat = mat('#b7c3be')
  const tray = named('InnerTray', [0, 0.1, 0])
  tray.add(
    box([2.0, 0.04, 1.3], [0, 0.02, 0], trayMat),
    box([2.0, 0.14, 0.04], [0, 0.09, 0.63], trayMat),
    box([2.0, 0.14, 0.04], [0, 0.09, -0.63], trayMat),
    box([0.04, 0.14, 1.3], [0.98, 0.09, 0], trayMat),
    box([0.04, 0.14, 1.3], [-0.98, 0.09, 0], trayMat),
    box([0.03, 0.12, 1.2], [-0.33, 0.08, 0], trayMat),
    box([0.03, 0.12, 1.2], [0.33, 0.08, 0], trayMat),
  )

  // Sensor board on the inner rear wall
  const sensor = named('SensorModule', [0.85, 0.6, -0.68])
  sensor.add(box([0.36, 0.24, 0.03], [0, 0, 0], mat('#2f5d50')))
  sensor.add(box([0.12, 0.12, 0.05], [0, 0.02, 0.03], mat('#1d1f21')))

  root.add(body, lid, tray, sensor)
  return root
}

const NO_CLIPS = []

export default function DemoContainer(props) {
  const root = useMemo(buildDemoRoot, [])
  return <ContainerModel root={root} clips={NO_CLIPS} {...props} />
}
