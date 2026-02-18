'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import type { Mesh } from 'three'
import { useScrollRef } from './ThreeCanvas'
import { useThemeColors } from './hooks/use-theme-colors'

type GeometryType = 'octahedron' | 'icosahedron' | 'tetrahedron' | 'torus'

export interface FloatingGeometryProps {
  /** ジオメトリの種類 */
  readonly geometry?: GeometryType
  /** 3D位置 */
  readonly position?: readonly [number, number, number]
  /** スケール */
  readonly scale?: number
  /** 浮遊速度 */
  readonly floatSpeed?: number
  /** 回転強度 */
  readonly rotationIntensity?: number
  /** 透明度 */
  readonly opacity?: number
}

/**
 * Drei Float でワイヤフレーム浮遊ジオメトリを描画。
 * 既存 FloatingAccents の 3D 版。
 * scroll progress → 回転角に加算。
 */
export function FloatingGeometry({
  geometry = 'octahedron',
  position = [0, 0, 0],
  scale = 0.5,
  floatSpeed = 1.5,
  rotationIntensity = 1,
  opacity = 0.3,
}: FloatingGeometryProps) {
  const meshRef = useRef<Mesh>(null)
  const scrollRef = useScrollRef()
  const colors = useThemeColors()

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const progress = scrollRef.current.progress
    // scroll progress で回転を加算
    mesh.rotation.x = progress * Math.PI * 2 * 0.3
    mesh.rotation.z = progress * Math.PI * 2 * 0.2
  })

  const geometryNode = (() => {
    switch (geometry) {
      case 'octahedron':
        return <octahedronGeometry args={[1, 0]} />
      case 'icosahedron':
        return <icosahedronGeometry args={[1, 0]} />
      case 'tetrahedron':
        return <tetrahedronGeometry args={[1, 0]} />
      case 'torus':
        return <torusGeometry args={[1, 0.3, 8, 12]} />
    }
  })()

  return (
    <Float
      speed={floatSpeed}
      rotationIntensity={rotationIntensity}
      floatIntensity={1}
    >
      <mesh
        ref={meshRef}
        position={[position[0], position[1], position[2]]}
        scale={scale}
      >
        {geometryNode}
        <meshBasicMaterial
          color={colors.primary}
          wireframe
          transparent
          opacity={opacity}
        />
      </mesh>
    </Float>
  )
}
