import type { ReactElement } from "react";

interface PageEffectRendererProps {
  readonly effectConfig: unknown;
}

/** Renders page-level effects (background Three.js, overlay PixiJS). Stub for now. */
export async function PageEffectRenderer({
  effectConfig: _effectConfig,
}: PageEffectRendererProps): Promise<ReactElement | null> {
  // TODO: Wire to effect registry in a future task
  void _effectConfig;
  return null;
}
