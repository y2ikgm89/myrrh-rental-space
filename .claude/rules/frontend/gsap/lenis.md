---
description: GSAP Lenis スムーススクロール・Tailwind CSS 4 と GSAP の transform 共存
paths:
  - "src/app/(public*)/_shared/lib/gsap*"
  - "src/app/(public*)/_shared/lib/animations*"
  - "src/app/(public*)/_shared/components/providers/lenis-provider*"
  - "src/app/(public*)/_shared/lib/a11y/motion*"
  - "src/app/(public*)/_components/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
---

# GSAP Lenis・Tailwind 共存

> GSAP 3.14.2 / Lenis 1.3.19 対応

## Lenis スムーススクロール

### useLenis() フック（消費側）

```typescript
"use client";

import { useLenis } from "lenis/react";

// インスタンス取得
const lenis = useLenis();

// スクロールイベント購読
useLenis((lenis) => {
  const progress = lenis.progress; // 0-1
  const velocity = lenis.velocity;
});
```

### SmoothScrollProvider（内部 — Lenis 公式推奨パターン）

```typescript
// GSAP ticker で Lenis の RAF を駆動
const lenis = new Lenis({ duration: 1.2 }); // autoRaf: false（デフォルト）
lenis.on("scroll", ScrollTrigger.update); // ScrollTrigger との同期

const tickerCb = (time: number) => {
  lenis.raf(time * 1000);
};
gsap.ticker.add(tickerCb);
gsap.ticker.lagSmoothing(0); // ラグ補正無効化
gsap.config({ autoSleep: 0 }); // ticker スリープ防止（デフォルト ~2秒で停止しスクロールがデッドロック）

ScrollTrigger.refresh(); // Lenis 初期化後に必須

// 動的コンテンツ対応: ResizeObserver で高さ変化を検知
const ro = new ResizeObserver(() => {
  ScrollTrigger.refresh(true);
});
ro.observe(document.body);
```

**設計ポイント**:

- `autoRaf: false`（デフォルト）— 同一 RAF フレーム内で Lenis 補間 → ScrollTrigger 更新 → GSAP tween 適用が実行され、フレーム同期が保証される
- `autoSleep: 0` — デフォルト（120フレーム ~2秒）でアイドル後に ticker が停止し Lenis がデッドロックするため必須
- `refresh(true)` — スクロール完了後に安全にトリガー位置を再計算（安全モード）
- `ReactLenis` コンポーネントは使用しない。`LenisContext` を直接提供し `useLenis()` との互換性を維持

### ScrollTrigger との連携注意事項

`SmoothScrollProvider` を使用している場合、`ScrollTrigger.refresh()` は Provider が管理する。
コンポーネント内では DOM 動的変更後（画像ロード完了等）のみ追加で呼び出す。

---

## Tailwind CSS 4 と GSAP の transform 共存

**GSAP がアニメーションする要素では Tailwind の transform クラス（`scale-*`, `rotate-*`, `translate-*`）を使わない。**

Tailwind CSS 4 は個別 CSS プロパティ（`scale`, `rotate`, `translate`）を生成し、GSAP は `transform` プロパティに書き込む。
同一要素に共存すると `clearProps` の不完全動作やマトリクス分解の汚染が発生する。

```typescript
// NG: GSAP アニメーション対象に Tailwind transform クラスを混在
<div className="scale-110 translate-y-4">  {/* GSAP も y をアニメーション */}

// OK: GSAP で transform を一元管理
gsap.set(imageRef.current, { scale: 1.15 })  // 初期値も GSAP で設定

// OK: GSAP が触らない要素は Tailwind のまま
<Image className="scale-110" />  // 対象外の子要素
```
