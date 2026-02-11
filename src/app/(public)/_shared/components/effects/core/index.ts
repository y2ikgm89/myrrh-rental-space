// Types
export type {
  EffectLevel,
  DeviceCapabilities,
  ScrollState,
  PerformanceBudget,
  WebGLContextEntry,
} from './types'
export { toEffectLevel, PERFORMANCE_BUDGETS } from './types'

// Device capabilities
export { detectDeviceCapabilities } from './device-capabilities'

// WebGL context manager
export { webGLContextManager } from './webgl-context-manager'

// Providers & hooks
export {
  VisualEffectsProvider,
  useVisualEffects,
  useVisualEffectsOptional,
} from './VisualEffectsProvider'

export {
  ScrollOrchestratorProvider,
  useScrollState,
  useScrollStateOptional,
} from './ScrollOrchestrator'

export { PerformanceMonitor } from './PerformanceMonitor'
