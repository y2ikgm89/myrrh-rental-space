'use client'

import { useEffect } from 'react'
import { usePixiApp } from './hooks/use-pixi-app'

/**
 * フィルムグレインエフェクト。
 *
 * PixiJS v8 カスタム Filter + GlProgram で実装。
 * uTime uniform でアニメーションするノイズを生成し、
 * シネマティックな質感を付加する。
 */

interface PixiGrainProps {
  /** グレイン強度 (0-1, default 0.05) */
  readonly intensity?: number
  /** アニメーション速度 (default 1.0) */
  readonly speed?: number
}

const VERTEX_SHADER = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`

const FRAGMENT_SHADER = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uIntensity;
uniform float uTime;

// Hash-based pseudo-random number generator
float random(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  float noise = random(vTextureCoord + vec2(uTime)) * 2.0 - 1.0;
  color.rgb += noise * uIntensity;
  finalColor = color;
}
`

export function PixiGrain({
  intensity = 0.05,
  speed = 1.0,
}: PixiGrainProps) {
  const app = usePixiApp()

  useEffect(() => {
    let filter: import('pixi.js').Filter | null = null
    let tickerCb: ((ticker: import('pixi.js').Ticker) => void) | null = null
    let destroyed = false

    const setup = async () => {
      const { Filter, GlProgram } = await import('pixi.js')
      if (destroyed) return

      const glProgram = new GlProgram({
        vertex: VERTEX_SHADER,
        fragment: FRAGMENT_SHADER,
      })

      filter = new Filter({
        glProgram,
        resources: {
          grainUniforms: {
            uIntensity: { value: intensity, type: 'f32' },
            uTime: { value: 0, type: 'f32' },
          },
        },
      })

      const existing = app.stage.filters
      app.stage.filters = [...(Array.isArray(existing) ? existing : []), filter]

      // ticker で uTime を更新 → アニメーショングレイン
      const tickerCallback = (ticker: import('pixi.js').Ticker) => {
        if (filter) {
          const resource = filter.resources['grainUniforms']
          if (resource?.uniforms) {
            resource.uniforms.uTime += ticker.deltaTime * 0.01 * speed
          }
        }
      }
      app.ticker.add(tickerCallback)
      tickerCb = tickerCallback
    }

    void setup()

    return () => {
      destroyed = true
      if (tickerCb) app.ticker.remove(tickerCb)
      if (filter) {
        // filters 配列から除去
        if (Array.isArray(app.stage.filters)) {
          app.stage.filters = app.stage.filters.filter((f) => f !== filter)
        }
        filter.destroy()
      }
    }
  }, [app, intensity, speed])

  return null
}
