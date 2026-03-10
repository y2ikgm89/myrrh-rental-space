"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import type { PerformanceMonitorApi } from "@react-three/drei";
import { webGLContextManager } from "../core/webgl-context-manager";
import type { ThreeCanvasInnerProps } from "./types";

/**
 * R3F Canvas 本体。next/dynamic({ ssr: false }) でロードされる。
 *
 * - Drei PerformanceMonitor で DPR 1-2 適応
 * - flipflops >= 3 → degradeTo(2) で L2 劣化
 * - webGLContextManager で WebGL コンテキスト管理
 */
export function ThreeCanvasInner({
  children,
  id,
  frameloop = "always",
  fov = 50,
  cameraPosition = [0, 0, 5],
  degradeTo,
}: ThreeCanvasInnerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dpr, setDpr] = useState<[number, number]>([1, 2]);

  // WebGL コンテキスト登録解除
  useEffect(() => {
    return () => {
      webGLContextManager.unregister(id);
    };
  }, [id]);

  // Canvas 作成時のハンドラ
  const handleCreated = (state: { gl: { domElement: HTMLCanvasElement } }) => {
    const canvas = state.gl.domElement;
    canvasRef.current = canvas;

    webGLContextManager.register({
      id,
      canvas,
      type: "three",
      createdAt: Date.now(),
    });
  };

  // PerformanceMonitor: DPR 変更
  const handlePerformanceChange = (api: PerformanceMonitorApi) => {
    // factor: 0-1, 低いほど低負荷が必要
    const newDpr = Math.round(0.5 + 1.5 * api.factor); // 1 or 2
    setDpr([newDpr, newDpr]);
  };

  // PerformanceMonitor: フォールバック（flipflops上限到達）
  const handleFallback = (_api: PerformanceMonitorApi) => {
    degradeTo(2);
  };

  return (
    <Canvas
      frameloop={frameloop}
      dpr={dpr}
      camera={{
        fov,
        position: [cameraPosition[0], cameraPosition[1], cameraPosition[2]],
        near: 0.1,
        far: 100,
      }}
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
      }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      onCreated={handleCreated}
    >
      <PerformanceMonitor
        flipflops={3}
        onChange={handlePerformanceChange}
        onFallback={handleFallback}
      >
        {children}
      </PerformanceMonitor>
    </Canvas>
  );
}
