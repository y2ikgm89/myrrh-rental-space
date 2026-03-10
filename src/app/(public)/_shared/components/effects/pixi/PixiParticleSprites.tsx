"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { usePixiApp } from "./hooks/use-pixi-app";
import { usePixiScroll } from "./hooks/use-pixi-scroll";
import type { ScrollState } from "../core/types";

/**
 * 2D ボケスプライトパーティクル。
 *
 * Graphics 円ベースのスプライトパーティクル。
 * - 決定的ハッシュで初期位置生成（React Compiler 互換）
 * - scroll velocity でドリフト速度変動
 * - 白色円 + 低 alpha で背景にブレンド
 */

interface PixiParticleSpritesProps {
  /** パーティクル数 (default 40) */
  readonly count?: number;
  /** サイズ範囲 [min, max] (default [2, 6]) */
  readonly sizeRange?: readonly [number, number];
  /** 不透明度範囲 [min, max] (default [0.1, 0.4]) */
  readonly opacityRange?: readonly [number, number];
}

/** 決定的ハッシュ関数（React Compiler 互換） */
function deterministicHash(seed: number): number {
  let hash = seed;
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
  hash = (hash >> 16) ^ hash;
  return (hash & 0x7fffffff) / 0x7fffffff;
}

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  alpha: number;
  speedX: number;
  speedY: number;
  phase: number;
}

function createParticles(
  count: number,
  width: number,
  height: number,
  sizeRange: readonly [number, number],
  opacityRange: readonly [number, number],
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const seed = i * 7 + 13;
    const x = deterministicHash(seed) * width;
    const y = deterministicHash(seed + 1) * height;
    const size =
      sizeRange[0] +
      deterministicHash(seed + 2) * (sizeRange[1] - sizeRange[0]);
    const alpha =
      opacityRange[0] +
      deterministicHash(seed + 3) * (opacityRange[1] - opacityRange[0]);
    const speedX = (deterministicHash(seed + 4) - 0.5) * 0.3;
    const speedY = (deterministicHash(seed + 5) - 0.5) * 0.2;
    const phase = deterministicHash(seed + 6) * Math.PI * 2;

    particles.push({
      x,
      y,
      baseX: x,
      baseY: y,
      size,
      alpha,
      speedX,
      speedY,
      phase,
    });
  }
  return particles;
}

function updateParticles(
  particles: Particle[],
  graphics: import("pixi.js").Graphics,
  width: number,
  height: number,
  elapsed: number,
  scrollRef: RefObject<ScrollState>,
): void {
  graphics.clear();

  const scrollVelocity = scrollRef.current.velocity;
  const velocityFactor = Math.min(Math.abs(scrollVelocity) * 0.002, 1.5);

  for (const p of particles) {
    const t = elapsed * 0.001;

    // 基本浮遊モーション
    const floatX = Math.sin(t * 0.5 + p.phase) * 20;
    const floatY = Math.cos(t * 0.3 + p.phase * 1.5) * 15;

    // スクロール連動ドリフト
    const driftX = p.speedX * velocityFactor * 30;
    const driftY = p.speedY * velocityFactor * 20 + scrollVelocity * 0.05;

    p.x = p.baseX + floatX + driftX;
    p.y = p.baseY + floatY + driftY;

    // 画面外ラップ
    if (p.x < -p.size) p.x += width + p.size * 2;
    if (p.x > width + p.size) p.x -= width + p.size * 2;
    if (p.y < -p.size) p.y += height + p.size * 2;
    if (p.y > height + p.size) p.y -= height + p.size * 2;

    // 白色円を描画
    const pulseAlpha = p.alpha * (0.8 + 0.2 * Math.sin(t + p.phase));
    graphics
      .circle(p.x, p.y, p.size)
      .fill({ color: 0xffffff, alpha: pulseAlpha });
  }
}

export function PixiParticleSprites({
  count = 40,
  sizeRange = [2, 6],
  opacityRange = [0.1, 0.4],
}: PixiParticleSpritesProps) {
  const app = usePixiApp();
  const scrollRef = usePixiScroll();
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    let graphics: import("pixi.js").Graphics | null = null;
    let tickerCb: (() => void) | null = null;
    let destroyed = false;

    const setup = async () => {
      const { Graphics } = await import("pixi.js");
      if (destroyed) return;

      graphics = new Graphics();
      app.stage.addChild(graphics);

      const width = app.screen.width;
      const height = app.screen.height;
      particlesRef.current = createParticles(
        count,
        width,
        height,
        sizeRange,
        opacityRange,
      );

      const tickerCallback = () => {
        if (graphics && !destroyed) {
          updateParticles(
            particlesRef.current,
            graphics,
            app.screen.width,
            app.screen.height,
            app.ticker.lastTime,
            scrollRef,
          );
        }
      };
      app.ticker.add(tickerCallback);
      tickerCb = tickerCallback;
    };

    void setup();

    return () => {
      destroyed = true;
      if (tickerCb) app.ticker.remove(tickerCb);
      if (graphics) {
        app.stage.removeChild(graphics);
        graphics.destroy();
      }
    };
  }, [app, scrollRef, count, sizeRange, opacityRange]);

  return null;
}
