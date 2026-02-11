import type { ReactNode } from 'react'
import type { EffectLevel } from '../core/types'

/** PixiCanvas 外部ラッパー props */
export interface PixiCanvasProps {
  readonly children: ReactNode
  readonly fallback?: ReactNode
  readonly id: string
  readonly className?: string
}

/** PixiCanvasInner に渡す内部 props */
export interface PixiCanvasInnerProps extends PixiCanvasProps {
  readonly degradeTo: (level: EffectLevel) => void
}
