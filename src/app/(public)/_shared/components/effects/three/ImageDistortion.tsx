'use client'

import { useRef, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { useScrollRef } from './ThreeCanvas'

export interface ImageDistortionProps {
  /** 画像URL */
  readonly src: string
  /** 幅 */
  readonly width?: number
  /** 高さ */
  readonly height?: number
  /** 歪み強度 */
  readonly intensity?: number
  /** 3D位置 */
  readonly position?: readonly [number, number, number]
}

const VERTEX_SHADER = /* glsl */ `
  uniform float uDistortion;
  uniform float uProgress;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    // スクロール速度に応じた波状の歪み
    pos.z += sin(pos.x * 3.0 + uProgress * 6.28) * uDistortion * 0.15;
    pos.z += cos(pos.y * 2.0 + uProgress * 3.14) * uDistortion * 0.1;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uDistortion;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    // ripple effect: スクロール速度に応じたUVオフセット
    uv.x += sin(uv.y * 10.0) * uDistortion * 0.02;
    uv.y += cos(uv.x * 8.0) * uDistortion * 0.015;
    vec4 color = texture2D(uTexture, uv);
    gl_FragColor = color;
  }
`

/**
 * GLSL シェーダ画像歪みコンポーネント。
 * scroll velocity で歪み量が増加、scroll progress で波の位相が変化。
 * Suspense 境界内で使用すること（useLoader がサスペンドする）。
 */
export function ImageDistortion({
  src,
  width = 4,
  height = 3,
  intensity = 1,
  position = [0, 0, 0],
}: ImageDistortionProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const scrollRef = useScrollRef()

  const texture = useLoader(THREE.TextureLoader, src)

  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uDistortion: { value: 0 },
      uProgress: { value: 0 },
    }),
    [texture],
  )

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const material = mesh.material
    if (!(material instanceof THREE.ShaderMaterial)) return

    const velocity = Math.abs(scrollRef.current.velocity)
    const progress = scrollRef.current.progress

    // velocity を 0-1 範囲にクランプし intensity で乗算
    material.uniforms['uDistortion']!.value =
      Math.min(velocity * 0.01, 1) * intensity
    material.uniforms['uProgress']!.value = progress
  })

  return (
    <mesh
      ref={meshRef}
      position={[position[0], position[1], position[2]]}
    >
      <planeGeometry args={[width, height, 32, 32]} />
      <shaderMaterial
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  )
}
