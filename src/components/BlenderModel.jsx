import { useGLTF } from '@react-three/drei'
import ContainerModel from './ContainerModel'

// Loads the exported Blender GLB and hands its scene and animation clips to the
// shared rig. Throws if the file is missing or invalid; Viewer3D catches that.
export default function BlenderModel({ url, ...props }) {
  const gltf = useGLTF(url)
  return <ContainerModel root={gltf.scene} clips={gltf.animations} {...props} />
}
