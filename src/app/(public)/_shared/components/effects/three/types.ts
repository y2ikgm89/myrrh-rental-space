import type { ReactNode, RefObject } from "react";
import type { ScrollState, EffectLevel } from "../core/types";

/** Mutable ref for zero-copy scroll data in useFrame */
export type ScrollUniformsRef = RefObject<ScrollState>;

/** ThreeCanvas props */
export interface ThreeCanvasProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
  readonly id: string;
  readonly className?: string;
  readonly frameloop?: "always" | "demand" | "never";
  readonly fov?: number;
  readonly cameraPosition?: readonly [number, number, number];
}

/** ThreeCanvasInner に渡す内部props */
export interface ThreeCanvasInnerProps extends ThreeCanvasProps {
  readonly scrollRef: RefObject<ScrollState>;
  readonly degradeTo: (level: EffectLevel) => void;
}

/** Theme colors resolved from CSS variables */
export interface ThemeColors {
  readonly primary: string;
  readonly background: string;
  readonly foreground: string;
  readonly accent: string;
}
