"use client";

import type { ReactElement } from "react";

interface EffectOverlayRendererProps {
  readonly effectIds: readonly string[];
  readonly config: Record<string, unknown>;
}

/** Renders section-level overlay effects (Three.js, PixiJS). Stub for now. */
export function EffectOverlayRenderer({
  effectIds: _effectIds,
  config: _config,
}: EffectOverlayRendererProps): ReactElement | null {
  // TODO: Wire to effect registry in a future task
  void _effectIds;
  void _config;
  return null;
}
