"use client";

import { useEffect, useRef, useState } from "react";
import type { Application } from "pixi.js";
import { PixiAppContext } from "./hooks/use-pixi-app";
import { webGLContextManager } from "../core/webgl-context-manager";
import type { PixiCanvasInnerProps } from "./types";

/**
 * PixiJS Application 本体。next/dynamic({ ssr: false }) でロードされる。
 *
 * - PixiJS v8 async 初期化（app.init()）
 * - 透明オーバーレイ（backgroundAlpha: 0）
 * - WebGL コンテキスト登録（webGLContextManager）
 * - FPS 監視: 60サンプル平均が30fps未満 × 3回連続 → degradeTo(3)
 * - PixiAppContext.Provider で子コンポーネントに Application を提供
 */

/** FPS 監視設定 */
const FPS_SAMPLE_SIZE = 60;
const FPS_THRESHOLD = 30;
const FPS_FAIL_LIMIT = 3;

export function PixiCanvasInner({
  children,
  id,
  degradeTo,
}: PixiCanvasInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [app, setApp] = useState<Application | null>(null);
  const appRef = useRef<Application | null>(null);
  const degradedRef = useRef(false);
  const degradeToRef = useRef(degradeTo);
  degradeToRef.current = degradeTo;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let pixiApp: Application | null = null;

    const init = async () => {
      try {
        const { Application } = await import("pixi.js");
        if (destroyed) return;

        pixiApp = new Application();
        await pixiApp.init({
          backgroundAlpha: 0,
          antialias: false,
          preference: "webgl",
          resolution: Math.min(window.devicePixelRatio, 2),
          autoDensity: true,
          resizeTo: container,
          autoStart: true,
        });

        if (destroyed) {
          pixiApp.destroy(true);
          return;
        }

        container.appendChild(pixiApp.canvas);

        // WebGL コンテキスト登録
        webGLContextManager.register({
          id,
          canvas: pixiApp.canvas,
          type: "pixi",
          createdAt: Date.now(),
        });

        // FPS 監視: ticker に直接統合
        const fpsSamples: number[] = [];
        let failCount = 0;

        pixiApp.ticker.add((ticker) => {
          fpsSamples.push(ticker.FPS);
          if (fpsSamples.length > FPS_SAMPLE_SIZE) {
            fpsSamples.shift();
          }

          // 60サンプル溜まったら平均チェック
          if (fpsSamples.length === FPS_SAMPLE_SIZE) {
            let sum = 0;
            for (const fps of fpsSamples) {
              sum += fps;
            }
            const avgFps = sum / FPS_SAMPLE_SIZE;

            if (avgFps < FPS_THRESHOLD) {
              failCount++;
              if (failCount >= FPS_FAIL_LIMIT) {
                if (!degradedRef.current) {
                  degradedRef.current = true;
                  degradeToRef.current(3);
                }
              }
            } else {
              failCount = 0;
            }
            // チェック後リセット
            fpsSamples.length = 0;
          }
        });

        appRef.current = pixiApp;
        setApp(pixiApp);
      } catch {
        // PixiJS 初期化失敗は黙殺（ページは正常動作）
      }
    };

    void init();

    return () => {
      destroyed = true;
      webGLContextManager.unregister(id);
      if (pixiApp) {
        pixiApp.destroy(true);
        pixiApp = null;
      }
      appRef.current = null;
    };
  }, [id]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {app ? <PixiAppContext value={app}>{children}</PixiAppContext> : null}
    </div>
  );
}
