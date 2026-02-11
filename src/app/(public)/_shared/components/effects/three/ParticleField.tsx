'use client'

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useScrollRef } from './ThreeCanvas'
import { useThemeColors } from './hooks/use-theme-colors'

export interface ParticleFieldProps {
  /** パーティクル数 */
  readonly count?: number
  /** 散布範囲 */
  readonly spread?: number
  /** 粒子サイズ */
  readonly size?: number
}

interface ParticleData {
  x: number
  y: number
  z: number
  speed: number
}

const DUMMY_OBJECT = new THREE.Object3D()

/**
 * パーティクル初期位置をシード付き擬似乱数で生成。
 * React Compiler 互換: 純粋関数（Math.random 不使用）。
 */
function generateParticles(count: number, spread: number): ParticleData[] {
  const positions: ParticleData[] = []
  for (let i = 0; i < count; i++) {
    // シード付き擬似乱数（インデックスベースで決定論的）
    const hash1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453
    const hash2 = Math.sin(i * 45.164 + 93.233) * 43758.5453
    const hash3 = Math.sin(i * 67.345 + 12.456) * 43758.5453
    const hash4 = Math.sin(i * 23.678 + 56.789) * 43758.5453

    positions.push({
      x: (fract(hash1) - 0.5) * spread,
      y: (fract(hash2) - 0.5) * spread,
      z: (fract(hash3) - 0.5) * spread * 0.5,
      speed: 0.2 + fract(hash4) * 0.8,
    })
  }
  return positions
}

/** 小数部分を取得 */
function fract(x: number): number {
  return x - Math.floor(x)
}

/**
 * InstancedMesh パーティクルフィールド。
 * 単一ドローコールで描画。scroll velocity がパーティクル移動速度に影響。
 */
export function ParticleField({
  count = 150,
  spread = 12,
  size = 0.03,
}: ParticleFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const scrollRef = useScrollRef()
  const colors = useThemeColors()

  // 決定論的なパーティクル位置生成（React Compiler 互換）
  const particles = useMemo(() => generateParticles(count, spread), [count, spread])

  // 色を useMemo で THREE.Color に変換
  const color = useMemo(() => new THREE.Color(colors.primary), [colors.primary])

  // 初期行列を設定
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      if (!p) continue
      DUMMY_OBJECT.position.set(p.x, p.y, p.z)
      DUMMY_OBJECT.updateMatrix()
      mesh.setMatrixAt(i, DUMMY_OBJECT.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [particles])

  useFrame((_state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return

    const velocity = Math.abs(scrollRef.current.velocity)
    const scrollY = scrollRef.current.scroll * 0.001

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      if (!p) continue

      // ゆっくり浮遊 + scroll velocity で加速
      const floatSpeed = p.speed * delta * 0.3
      const velocityBoost = velocity * delta * p.speed * 0.5

      DUMMY_OBJECT.position.set(
        p.x + Math.sin(scrollY + i * 0.1) * 0.3,
        p.y + Math.cos(scrollY * 0.7 + i * 0.15) * 0.2 + velocityBoost,
        p.z + Math.sin(scrollY * 0.5 + i * 0.2) * 0.1,
      )

      // 微回転
      DUMMY_OBJECT.rotation.y += floatSpeed * 0.5
      DUMMY_OBJECT.updateMatrix()
      mesh.setMatrixAt(i, DUMMY_OBJECT.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[size, 6, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} />
    </instancedMesh>
  )
}
