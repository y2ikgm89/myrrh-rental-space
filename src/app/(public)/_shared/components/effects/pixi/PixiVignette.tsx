'use client'

import { useEffect } from 'react'
import { usePixiApp } from './hooks/use-pixi-app'

/**
 * ビネットエフェクト。
 *
 * smoothstep でエッジを暗くするカスタム GLSL Filter。
 * Hero セクションでシネマティックなフレーミングを付加。
 */

interface PixiVignetteProps {
  /** ビネット強度 (0-1, default 0.3) */
  readonly intensity?: number
  /** ビネット開始半径 (0-1, default 0.7) */
  readonly radius?: number
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
uniform float uRadius;

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  float dist = distance(vTextureCoord, vec2(0.5));
  float vignette = smoothstep(uRadius, uRadius + 0.3, dist) * uIntensity;
  finalColor = vec4(color.rgb * (1.0 - vignette), color.a);
}
`

export function PixiVignette({
  intensity = 0.3,
  radius = 0.7,
}: PixiVignetteProps) {
  const app = usePixiApp()

  useEffect(() => {
    let filter: import('pixi.js').Filter | null = null
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
          vignetteUniforms: {
            uIntensity: { value: intensity, type: 'f32' },
            uRadius: { value: radius, type: 'f32' },
          },
        },
      })

      const existing = app.stage.filters
      app.stage.filters = [...(Array.isArray(existing) ? existing : []), filter]
    }

    void setup()

    return () => {
      destroyed = true
      if (filter) {
        if (Array.isArray(app.stage.filters)) {
          app.stage.filters = app.stage.filters.filter((f) => f !== filter)
        }
        filter.destroy()
      }
    }
  }, [app, intensity, radius])

  return null
}
