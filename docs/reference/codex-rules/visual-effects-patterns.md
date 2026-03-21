---
paths:
  - src/app/(public*)/_shared/components/animations/**
  - src/app/(public*)/_shared/lib/animations*
---

# ビジュアルエフェクトアーキテクチャ

> **注意**: 旧 ExperienceShell / VisualEffectsProvider / `effects/` インフラは削除済み。後方互換レイヤーは置かない。

## 概要

公開ページのビジュアルエフェクトは Page-First Architecture に基づき、ページコンポーネントから直接制御する。
**既定の基盤は GSAP + Lenis**（[Reduced Motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) は `gsap-patterns.md`）。
**L3 Three.js / L4 PixiJS** は現状リポジトリの依存に含めない。必要なページのみ [`three` + R3F](https://r3f.docs.pmnd.rs/getting-started/installation) / [PixiJS 8](https://pixijs.com/8.x/guides) を `bun add` し、Client + 動的ロードで直接統合する（`threejs-patterns.md` / `pixijs-patterns.md`）。

> **詳細リファレンス**: `docs/reference/claude-rules/visual-effects-reference.md`

## エフェクトレベル定義

| レベル | 技術           | 対象デバイス                      | 内容                                                                                                |
| ------ | -------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| L1     | CSS only       | 低性能 / `prefers-reduced-motion` | CSS transition, @keyframes, SVG animation, scroll-driven animation, backdrop-filter, mix-blend-mode |
| L2     | GSAP + Lenis   | 中性能                            | ScrollTrigger, スムーススクロール, パララックス                                                     |
| L3     | Three.js (R3F) | 高性能                            | 3D パーティクル, 浮遊ジオメトリ, WebGL                                                              |
| L4     | PixiJS v8      | 最高性能（デスクトップ専用GPU）   | 2D GLSLフィルター, グレイン, ビネット, スプライト                                                   |

## Z-index ベースライン

| z-index | 用途                           |
| ------- | ------------------------------ |
| 0       | 背景レイヤー                   |
| 2       | Three.js Canvas                |
| 3       | PixiJS Canvas                  |
| 5       | 装飾アクセント                 |
| 10      | コンテンツ（テキスト、ボタン） |
| 20      | スクロールインジケーター       |

## レスポンシブ戦略

| コンテキスト        | ブレークポイント | 備考                 |
| ------------------- | ---------------- | -------------------- |
| Tailwind CSS        | `md: 768px`      | CSS レイアウト用     |
| `gsap.matchMedia()` | `800px`          | アニメーション分岐用 |

## 禁止事項

1. **React stateでスクロールデータ管理禁止** — mutable ref パターン使用
2. **reduced-motion 対応無視禁止** — → `gsap-patterns.md` §reduced-motion 対応（パターン A/B/C）
3. **サーバーコンポーネントでのアニメーション制御禁止** — `'use client'` 必須
4. **フォールバック未定義の高レベルエフェクト禁止** — L3/L4 を入れるページでは L2/L1 への退避を必ず設計する。依存未導入の間は L2 以下のみで実装する
