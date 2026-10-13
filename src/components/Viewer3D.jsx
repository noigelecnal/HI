import { Component, Suspense, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { MODEL_CONFIG } from '../config/modelConfig'
import BlenderModel from './BlenderModel'
import DemoContainer from './DemoContainer'

class ModelBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('Failed to load model:', error)
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function CameraRig({ resetCount }) {
  const controls = useRef()
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    controls.current?.saveState()
  }, [])

  useEffect(() => {
    if (resetCount > 0) {
      controls.current?.reset()
      invalidate()
    }
  }, [resetCount, invalidate])

  const { target, minDistance, maxDistance } = MODEL_CONFIG.camera
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={target}
      enableDamping
      dampingFactor={0.08}
      minDistance={minDistance}
      maxDistance={maxDistance}
      maxPolarAngle={Math.PI / 2 - 0.04}
      enablePan={false}
    />
  )
}

function Scene({ modelProps, resetCount, onModelError }) {
  const demo = <DemoContainer {...modelProps} />
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 7, 5]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0004}
      />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 5, -6]} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-6, 2, 3]} scale={[4, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[6, 2, 3]} scale={[4, 6, 1]} />
      </Environment>

      {MODEL_CONFIG.glbUrl ? (
        <ModelBoundary fallback={demo} onError={onModelError}>
          <Suspense fallback={null}>
            <BlenderModel url={MODEL_CONFIG.glbUrl} {...modelProps} />
          </Suspense>
        </ModelBoundary>
      ) : (
        demo
      )}

      <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={9} blur={2.6} far={3} />
      <CameraRig resetCount={resetCount} />
    </>
  )
}

export default function Viewer3D({ modelProps, resetCount, onModelError }) {
  const { position, fov } = MODEL_CONFIG.camera
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position, fov }} gl={{ antialias: true }}>
      <Scene modelProps={modelProps} resetCount={resetCount} onModelError={onModelError} />
    </Canvas>
  )
}
