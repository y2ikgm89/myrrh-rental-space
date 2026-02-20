"use client";

import { createContext, use } from "react";
import type { Application } from "pixi.js";

/**
 * PixiJS Application を子コンポーネントに提供するコンテキスト。
 * PixiCanvasInner が Provider を設定し、
 * PixiGrain / PixiVignette / PixiParticleSprites が usePixiApp() でアクセスする。
 */
export const PixiAppContext = createContext<Application | undefined>(undefined);

/**
 * PixiJS Application インスタンスを取得する hook。
 * PixiCanvas 内部でのみ使用可能。
 */
export function usePixiApp(): Application {
  const app = use(PixiAppContext);
  if (app === undefined) {
    throw new Error("usePixiApp must be used within PixiCanvas");
  }
  return app;
}
