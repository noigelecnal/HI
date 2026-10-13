import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COMPONENTS, HIGHLIGHT_COLOR, MODEL_CONFIG } from '../config/modelConfig'
import ModelLabels from './ModelLabels'

const HIGHLIGHT = new THREE.Color(HIGHLIGHT_COLOR)
const tmp = new THREE.Vector3()
const NO_CLIPS = []

const findObject = (root, names) => {
  for (const name of names) {
    const found = root.getObjectByName(name)
    if (found) return found
  }
  return null
}

const findClip = (clips, names) => {
  const wanted = names.map((n) => n.toLowerCase())
  return clips.find((c) => wanted.includes(c.name.toLowerCase())) ?? null
}

// Resolve every configured component against the loaded object tree once.
// Original transforms are stored so exploded view never accumulates offsets.
function buildRegistry(root, clips) {
  root.updateMatrixWorld(true)
  const animatedPositions = new Set(
    clips.flatMap((c) => c.tracks.filter((t) => t.name.endsWith('.position')).map((t) => t.name.split('.')[0])),
  )

  const items = new Map()
  for (const def of COMPONENTS) {
    const object = findObject(root, def.meshNames)
    if (!object) continue

    // Clone materials once so highlighting one part never tints another.
    const materials = []
    object.traverse((child) => {
      if (!child.isMesh) return
      if (!child.userData.materialsCloned) {
        child.material = Array.isArray(child.material) ? child.material.map((m) => m.clone()) : child.material.clone()
        child.userData.materialsCloned = true
      }
      const list = Array.isArray(child.material) ? child.material : [child.material]
      list.forEach((m) => {
        if (m.emissive) {
          materials.push({ m, color: m.emissive.clone(), intensity: m.emissiveIntensity ?? 1 })
        }
      })
    })

    // Marker anchor lives inside the component so it follows open/explode motion.
    const anchorName = `__anchor_${def.id}`
    let anchor = object.getObjectByName(anchorName)
    if (!anchor) {
      anchor = new THREE.Object3D()
      anchor.name = anchorName
      anchor.position.set(...def.labelAnchor)
      object.add(anchor)
    }

    items.set(def.id, {
      def,
      object,
      anchor,
      materials,
      basePosition: object.position.clone(),
      baseRotation: object.rotation.clone(),
      explodeOffset: new THREE.Vector3(...def.explodeOffset),
      animatesPosition: animatedPositions.has(object.name),
    })
  }

  // Animation: prefer clips from the model, otherwise rotate the lid object.
  const { openClips, closeClips } = MODEL_CONFIG.animation
  const openClip = findClip(clips, openClips)
  const closeClip = findClip(clips, closeClips)
  const lid = items.get('lid')

  let mode = 'none'
  if (openClip || closeClip) mode = 'clips'
  else if (lid) mode = 'lid-rotation'

  return { items, openClip, closeClip, mode }
}

export default function ContainerModel({ root, clips = NO_CLIPS, openTarget, exploded, hiddenIds, selectedId, onSelect, onInfo, onMotion }) {
  const registry = useMemo(() => buildRegistry(root, clips), [root, clips])

  // Latest props for the frame loop, without re-subscribing every render.
  const live = useRef({ openTarget, exploded })
  live.current = { openTarget, exploded }
  const progress = useRef(0)
  const explode = useRef(0)
  const lastMotion = useRef('closed')

  const mixer = useMemo(() => {
    if (registry.mode !== 'clips') return null
    const m = new THREE.AnimationMixer(root)
    const clip = registry.openClip ?? registry.closeClip
    const action = m.clipAction(clip)
    action.play()
    action.paused = true
    return { mixer: m, action, duration: clip.duration, reversed: !registry.openClip }
  }, [registry, root])

  useEffect(() => {
    onInfo?.({
      mode: registry.mode,
      clips: clips.map((c) => c.name),
      found: Object.fromEntries([...registry.items].map(([id, item]) => [id, item.object.name])),
    })
  }, [registry, clips, onInfo])

  useEffect(() => {
    registry.items.forEach((item, id) => {
      item.object.visible = !hiddenIds.has(id)
    })
  }, [registry, hiddenIds])

  useEffect(() => {
    registry.items.forEach((item, id) => {
      const on = id === selectedId
      item.materials.forEach(({ m, color, intensity }) => {
        m.emissive.copy(on ? HIGHLIGHT : color)
        m.emissiveIntensity = on ? 0.5 : intensity
      })
    })
  }, [registry, selectedId])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const { openTarget: target, exploded: wantExploded } = live.current

    let p = progress.current
    if (p !== target) {
      p = THREE.MathUtils.damp(p, target, 5, dt)
      if (Math.abs(p - target) < 0.0005) p = target
      progress.current = p
    }
    const eTarget = wantExploded ? 1 : 0
    let e = explode.current
    if (e !== eTarget) {
      e = THREE.MathUtils.damp(e, eTarget, 4, dt)
      if (Math.abs(e - eTarget) < 0.0005) e = eTarget
      explode.current = e
    }

    // Lid opening
    if (mixer) {
      const t = mixer.reversed ? 1 - p : p
      mixer.action.time = Math.min(t * mixer.duration, mixer.duration - 1e-4)
      mixer.mixer.update(0)
    } else if (registry.mode === 'lid-rotation') {
      const lid = registry.items.get('lid')
      const { axis, angleDeg, direction } = MODEL_CONFIG.animation.lidFallback
      lid.object.rotation[axis] = lid.baseRotation[axis] + direction * THREE.MathUtils.degToRad(angleDeg) * p
    }

    // Exploded view: always computed from the stored original position.
    registry.items.forEach((item) => {
      if (item.animatesPosition) {
        // A clip already wrote this frame's position; add the offset on top.
        item.object.position.add(tmp.copy(item.explodeOffset).multiplyScalar(e))
      } else {
        item.object.position.copy(item.basePosition).addScaledVector(item.explodeOffset, e)
      }
    })

    // Report open/closed state to the UI only when it changes.
    let motion
    if (p === target) motion = p >= 0.999 ? 'open' : p <= 0.001 ? 'closed' : 'partial'
    else motion = target > p ? 'opening' : 'closing'
    if (motion !== lastMotion.current) {
      lastMotion.current = motion
      onMotion?.(motion)
    }
  })

  return (
    <>
      <primitive object={root} />
      <ModelLabels items={registry.items} hiddenIds={hiddenIds} selectedId={selectedId} onSelect={onSelect} />
    </>
  )
}
