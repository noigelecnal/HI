import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'

// One clickable marker. The group is kept at the anchor's world position,
// so the marker follows the part through opening and exploded motion.
function Marker({ id, item, selected, onSelect }) {
  const group = useRef()

  useFrame(() => {
    if (group.current) item.anchor.getWorldPosition(group.current.position)
  })

  return (
    <group ref={group}>
      <Html center zIndexRange={[20, 0]}>
        <button
          type="button"
          className={`marker${selected ? ' is-selected' : ''}`}
          aria-label={`Select ${item.def.label}`}
          aria-pressed={selected}
          onClick={() => onSelect(id)}
        >
          <span className="marker-dot" />
          <span className="marker-text">{item.def.label}</span>
        </button>
      </Html>
    </group>
  )
}

export default function ModelLabels({ items, hiddenIds, selectedId, onSelect }) {
  return [...items]
    .filter(([id]) => !hiddenIds.has(id))
    .map(([id, item]) => (
      <Marker key={id} id={id} item={item} selected={id === selectedId} onSelect={onSelect} />
    ))
}
