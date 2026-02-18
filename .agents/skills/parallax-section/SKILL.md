---
name: parallax-section
description: Creates multi-layer parallax sections using GSAP ScrollTrigger. Use when building hero sections, scroll-driven content reveals, stacking cards, photo galleries, zoom effects, or any scroll-animated visual section on public pages. Supports entrance animations, 3-layer composition, Three.js/PixiJS integration, and mood-based design customization.
---


# パララックスセクション生成

GSAP ScrollTrigger による多層パララックスセクションを作成します。

## 引数

- `SectionName`: PascalCase（例: `Feature`, `Testimonial`, `Pricing`）
- `タイプ`: `hero`（デフォルト）, `content`, `cta`, `stacking`, `gallery`, `zoom`, `sequence`, `split`

## セクションタイプ

| タイプ | 層数 | 特徴 |
|--------|------|------|
| `hero` | 5層 | スクロール連動フェードアウト、テキスト分割、パララックス背景 |
| `content` | 3層 | ScrollReveal入場、背景パララックス、clipPathリビール |
| `cta` | 3層 | グラデーション、スケールリビール、浮遊装飾 |
| `stacking` | N層 | セクション重なり（sticky stacking）、カード/画像が重なりながらスクロール |
| `gallery` | 2層 | ブロークングリッド + ScrollTrigger.batch入場、写真重視レイアウト |
| `zoom` | 6層 | Perspective Z軸ズーム、画像レイヤーが手前に飛び出す没入型演出 |
| `sequence` | 1層 | Canvas イメージシーケンス、スクロール動画（Apple風） |
| `split` | 2層 | data-speed属性パララックス + CSS --progress制御、宣言的構成 |

## デザインインテント語彙

### ムード→アニメーション マッピング

| ムード | 入場 | スクロール連動 | イージング | パララックス量(desktop) | stagger |
|--------|------|-------------|----------|------------------------|---------|
| **ドラマチック** | scale(0.8→1) + opacity | scrub: 1, pin | `expo.out` | yPercent: ±40 | 0.3-0.5 |
| **エレガント** | y(30→0) + opacity | scrub: true, smooth | `power2.out` | yPercent: ±15 | 0.12-0.18 |
| **プレイフル** | scale + rotateZ + bounce | scrub: 0.5, snap | `back.out(1.7)` | yPercent: ±25 | 0.08-0.12 |
| **コーポレート** | y(20→0) + opacity | toggleActions (1回) | `power1.out` | yPercent: ±8 | 0.10-0.15 |
| **オーガニック** | clipPath circle reveal | scrub: true, slow | `sine.inOut` | yPercent: ±20 | 0.15-0.25 |
| **ブルータリスト** | x(-100→0), 鋭い | scrub: true, snappy | `steps(8)` or `power4.out` | yPercent: ±30 | 0.06-0.10 |
| **エディトリアル** | mask reveal (overflow:hidden) | scrub: true | `power3.inOut` | yPercent: ±12 | 0.12-0.20 |
| **ラグジュアリー** | blur(8→0) + scale(1.05→1) | scrub: 0.5 | `power2.inOut` | yPercent: ±10 | 0.20-0.35 |

### ムード→ビジュアル マッピング

| ムード | 色調 | タイポグラフィ | レイアウト傾向 | Three.js/PixiJS |
|--------|------|-------------|-------------|----------------|
| **ドラマチック** | 高コントラスト、深い色 | 大型serif/display | 全画面、重なり | Bloom + particles |
| **エレガント** | 低彩度、金/ivory | 細身serif + tracking広め | 余白多め、左右非対称 | Vignette + soft grain |
| **プレイフル** | 高彩度、complementary | 丸みgeometric sans | ベントグリッド、回転要素 | Colorful particles |
| **コーポレート** | 青/グレー基調 | 均一sans-serif | グリッド整列、カード | Minimal/none |
| **オーガニック** | 暖色、アーストーン | 手書き風 or humanist | 自由配置、曲線 | Displacement + noise |
| **ブルータリスト** | モノクロ + アクセント1色 | Heavy grotesque | 壊れたグリッド、オーバーラップ | Glitch + scanline |
| **エディトリアル** | 白黒 + 差し色 | Didone/Modern serif | エディトリアルグリッド、列 | Grain + vignette |
| **ラグジュアリー** | 暗い背景 + 金/銀 | 上品serif + sans | フルブリード画像、ミニマル | Glass + bloom + grain |

> **インテンシティダイアル詳細・モバイルスケーリングルール**: → `reference/mood-variants.md`

## リファレンスサイト

| 業種 | サイト | 注目ポイント | パララックスタイプ |
|------|--------|------------|----------------|
| 建築 | azumagumi.co.jp/recruit | イラスト分割レイヤー、CSS固定パララックス | hero (fixed), stacking |
| 建築 | tomore.jp | セクション重なり、カスタムカーソル、Lottie | stacking, hero |
| ファッション | grfrn.com | エディトリアルレイアウト、テキストリビール | content, gallery |
| フード | bluebottlecoffee.com | ミニマル、写真フルブリード、控えめアニメーション | content, split |
| テクノロジー | stripe.com | 3Dグラデーション、インタラクティブ要素 | hero (3D), content |
| アート | teamlab.art | 没入型、フルスクリーン動画、パーティクル | sequence, zoom |
| ホスピタリティ | aman.com | ラグジュアリー、全画面写真、控えめ動き | hero, gallery |
| 不動産 | mizota-ks.com | 建築写真、ブロークングリッド、パララックス | gallery, content |

## コンポジションパターン

| パターン | 特徴 | Tailwind / CSS | 適合タイプ | 適合ムード |
|---------|------|---------------|-----------|-----------|
| **対称** | 中央揃え、均等配分 | `text-center`, `mx-auto`, `grid-cols-2` | hero, cta | コーポレート、エレガント |
| **非対称** | 左右不均等、視覚的テンション | `grid-cols-[2fr_1fr]`, `ml-[10%]` | content, split | エディトリアル、ラグジュアリー |
| **重なり** | 要素の意図的重複 | `relative`, `-mt-20`, `z-10` | stacking, hero | ドラマチック、ブルータリスト |
| **壊れたグリッド** | 不規則な配置 | `translate-y-[offset]`, `rotate-[deg]` | gallery | プレイフル、ブルータリスト |
| **エディトリアル** | テキスト列+余白+画像 | `max-w-prose`, `columns-2` | content, split | エディトリアル、ラグジュアリー |
| **フルブリード** | 画面幅いっぱい | `w-screen`, `-mx-[calc(...)]` | hero, gallery | ドラマチック、ラグジュアリー |

実装ノート:
- **壊れたグリッド**: `deterministicOffset()` で決定的な不規則配置（Math.random禁止）
- **重なり**: `z-index` + 負マージン、`isolation: isolate` でブレンドモード分離
- **フルブリード**: Container外配置は `w-screen` + `relative left-1/2 -translate-x-1/2`

## 実行手順

### 1. 要件確認

ユーザーに以下を確認:
- セクションの目的（何を表示するか）
- レイヤー構成（デフォルト: タイプ別標準構成）
- Three.js / PixiJS 拡張の要否
- 配置先の公開ページルートグループ

### 1.5 デザインインテリジェンス（ui-ux-pro-max 連携）

#### スタイル → パララックスタイプ マッピング

| ui-ux-pro-max スタイル | parallax-section タイプ | 推奨L | 検索コマンド |
|------------------------|----------------------|-------|-------------|
| Motion-Driven (15) | `hero`, `content`, `split` | L2+ | `--domain style "motion scroll parallax"` |
| 3D & Hyperrealism (5) | Three.js拡張 + `hero` | L3+ | `--domain style "3D immersive depth"` |
| Parallax Storytelling (49) | `hero`, `stacking`, `zoom` | L2+ | `--domain style "parallax storytelling scroll"` |
| Kinetic Typography (48) | `hero` (SplitText) | L2+ | `--domain style "kinetic typography motion"` |
| Dimensional Layering (46) | `stacking`, `zoom` | L2+ | `--domain style "layering depth z-index"` |
| Liquid Glass (14) | `hero` + PixiJS | L4 | `--domain style "glass blur fluid"` |
| Spatial UI (55) | `zoom` + Three.js | L3+ | `--domain style "spatial 3D depth"` |

#### ランディングパターン → パララックスタイプ マッピング

| ui-ux-pro-max パターン | parallax-section タイプ | 主なアニメーション |
|------------------------|----------------------|-----------------|
| Hero + Features + CTA (1) | `hero` + `content` + `cta` | Hero parallax, card lift, CTA glow |
| Scroll-Triggered Storytelling (10) | `hero` → `stacking` → `cta` | ScrollTrigger, progressive disclosure |
| Video-First Hero (9) | `sequence` or `hero` | Video parallax, text fade-in |
| Immersive/Interactive (17) | `zoom` + Three.js拡張 | WebGL, 3D |
| Horizontal Scroll Journey (27) | `gallery` (横スクロール) | Scroll-jacking, parallax layers |
| Bento Grid Showcase (28) | `gallery` (グリッド) | Card scale, staggered reveal |

#### 推奨検索フロー

`project-design-config.md` §ブランド のキーワードを使って検索:

```bash
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<業種キーワード>" --domain product
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "motion parallax scroll" --domain style
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "scroll storytelling hero" --domain landing
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<ムードキーワード>" --domain color
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "animation scroll performance" --domain ux
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "scroll animation performance" --stack nextjs
```

### 2. 既存実装の確認

タイプに応じた参照実装を読み込む:

| タイプ | 参照ファイル |
|--------|------------|
| hero | `_shared/components/sections/ParallaxHero.tsx`, `_components/HeroSection.tsx` |
| content | `_components/ConceptSection.tsx`, `_components/SpacesSection.tsx` |
| cta | `(public)/.../sections/CTASectionRenderer.tsx` |
| stacking | CSS `sticky` + `top: 0` + `height: 100svh` 基本 |
| gallery | CSS Grid + `transform: translateY()` + `ScrollTrigger.batch()` |

共通: `(public)/_shared/lib/gsap-config.ts`

### 3. ルールファイル確認

- `docs/reference/codex-rules/gsap-patterns.md` — GSAP / ScrollTrigger / Lenis
- `docs/reference/codex-rules/visual-effects-patterns.md` — エフェクトレベルアーキテクチャ
- `docs/reference/codex-rules/threejs-patterns.md` — Three.js / R3F（拡張時）
- `docs/reference/codex-rules/pixijs-patterns.md` — PixiJS v8（拡張時）

高度なパターンが必要な場合は `docs/reference/claude-rules/` のリファレンスも参照:
- `gsap-reference.md` — タイムライン、遷移、Lenis詳細
- `threejs-reference.md` — GSAP統合、モデル、カメラパス
- `pixijs-reference.md` — GLSL、画像遷移、フィルター合成
- `shader-patterns-reference.md` — GLSL共通パターン（ノイズ、SDF、カラー空間）

### 4. セクション作成

基本テンプレート（全タイプ共通）:

```typescript
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '../../lib/gsap-config'

export function {SectionName}Section() {
  const sectionRef = useRef<HTMLElement>(null)

  useGSAP(() => {
    const section = sectionRef.current
    if (!section) return

    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // === アニメーション定義 ===
      // reduce 時: ハンドラなし → GSAP 不介入 → CSS デフォルト（visible）
    })
  }, { scope: sectionRef })

  return (
    <section ref={sectionRef} id="{section-id}" className="relative ...">
      {/* レイヤー構成 */}
    </section>
  )
}
```

**パターン選択**: → `docs/reference/codex-rules/gsap-patterns.md` §reduced-motion 対応

> **各タイプ（hero/content/cta/stacking/gallery/zoom/sequence/split）の完全テンプレートコード + ムードバリアント表**: → `reference/section-templates.md`

### 5. Three.js / PixiJS 拡張（オプション）

```typescript
// Three.js
<ThreeCanvas id="{section}-three" className="absolute inset-0 z-[2]">
  <ParticleField count={100} spread={10} size={0.02} />
</ThreeCanvas>

// PixiJS
<PixiCanvas id="{section}-pixi" className="absolute inset-0 z-[3]">
  <PixiGrain intensity={0.04} />
  <PixiVignette intensity={0.25} radius={0.75} />
</PixiCanvas>
```

#### Advanced Effects Workflow

高度なエフェクトが必要な場合、各リファレンスを参照:

| エフェクト要件 | 参照リファレンス |
|-------------|--------------|
| カスタムシェーダー | `pixijs-reference.md` §GLSL シェーダー記述ガイド |
| 3Dモデル統合 | `threejs-reference.md` §モデルローディングパターン |
| カメラパスアニメーション | `threejs-reference.md` §スクロール連動カメラパス |
| 画像遷移エフェクト | `pixijs-reference.md` §画像遷移エフェクト |
| タイムラインオーケストレーション | `gsap-reference.md` §タイムラインオーケストレーション |
| シェーダー共通パターン | `shader-patterns-reference.md` |

### 6. エクスポートとインデックス更新

```typescript
// sections/index.ts
export { {SectionName}Section } from './{SectionName}Section'
```

### 7. チェックリスト

**必須:**
- [ ] `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` でアニメーションをラップ
- [ ] `useGSAP` + `scope` パターン（`useCallback` は不要 — React Compiler 自動メモ化）
- [ ] `gsap-config.ts` から import（直接 import 禁止）
- [ ] Math.random() 不使用（決定的ハッシュ使用）
- [ ] `pin: true` 使用時は `invalidateOnRefresh: true`
- [ ] Three.js/PixiJS使用時は `VisualEffectsProvider` 内
- [ ] z-index規約（bg:0, three:2, pixi:3, accents:5, content:10）
- [ ] テーマ変数使用（ハードコードカラー禁止）
- [ ] `bun run type-check` 通過

**レスポンシブ:**
- [ ] `gsap.matchMedia()` でデスクトップ（800px+）/モバイル（799px-）分岐
- [ ] モバイルではパララックス量 × 0.4〜0.5 に縮小（`mood-variants.md` パラメータ別テーブル参照）
- [ ] モバイルではピン固定回避（通常スクロール or scroll-snap）
- [ ] モバイルでは層数簡略化（5層→3層）
- [ ] `100svh` 使用（`100vh` 禁止）
- [ ] Three.js モバイル: DPR上限1.5、パーティクル数40%

**パフォーマンス:**
- [ ] `force3D: true` をGPU加速要素に適用
- [ ] 大量要素は `ScrollTrigger.batch()` 使用
- [ ] DOM変更後は `ScrollTrigger.refresh()` 呼出
- [ ] `useFrame` 内で `new` 生成しない

**デザインインテリジェンス:**
- [ ] Step 1.5 で `ui-ux-pro-max` 検索実行
- [ ] スタイル→パララックスタイプのマッピング参照
- [ ] UX検索で `animation`, `scroll`, `accessibility` 確認
- [ ] タイムラインオーケストレーション使用時はラベルでタイミング管理
- [ ] シェーダー使用時は `shader-patterns-reference.md` の命名規約準拠
- [ ] テスト: Playwright visual regression（スクリーンショット比較）

### 8. デザイナーハンドオフ

| 素材 | 推奨形式 | 注意事項 |
|------|---------|---------|
| イラスト（レイヤー分割） | Figma / Illustrator | 透過PNG or WebP |
| 写真 | WebP（85%品質）| デスクトップ/モバイル2サイズ |
| SVGマスク | SVG最適化済み | `mask-image` 用単色パスのみ |
| アニメーション指示 | Lottie JSON or タイミングシート | easing・duration明記 |
| カラーパレット | OKLCH値 | `public.css` テーマ変数に反映 |

Figma変換ルール: Auto Layout gap → `gap-{n}`, Frame padding → `p-{n}`, Opacity → `gsap.fromTo`, Layer order → `z-index`

### 9. テスト指針

```bash
bun run validate
```

| 確認項目 | 確認方法 |
|---------|---------|
| パララックス動作 | スクロールで各レイヤー速度差確認 |
| モバイル動作 | DevTools モバイルビュー |
| `prefers-reduced-motion` | OS設定 or DevTools Rendering |
| パフォーマンス | DevTools Performance タブ 60fps確認 |
| CLS | Lighthouse CLS < 0.1 |

### 10. よくある失敗パターン

| 失敗パターン | 対策 |
|-------------|------|
| モバイルでピン固定が壊れる | `gsap.matchMedia` でモバイルは `pin: false`、`scroll-snap` 代替 |
| ScrollTrigger が発火しない | `useGSAP` + `scope` でマウント保証、`ScrollTrigger.refresh()` |
| Lenis とスクロール競合 | Lenis を一元管理、他ライブラリのスクロール制御を無効化 |
| 画像読込前にアニメーション開始 | `aspect-ratio` CSS指定、`ScrollTrigger.refresh()` をload後 |
| CLS | `min-height: 100svh` で初期サイズ確保 |
| メモリリーク | `useGSAP` + `scope` で自動クリーンアップ |
| 60fps 未達 | `transform`, `opacity` のみ使用、`force3D: true` |
| Three.js SSR エラー | `next/dynamic` + `ssr: false` + effectLevel ゲート |
| WebGL context lost | `webGLContextManager` で LRU 管理 |
| React Compiler メモ化破壊 | ref 参照を含むイベントハンドラは `useCallback` を使わずプレーン関数で定義 |

## Definition of Done

- [ ] `bun run type-check` 通過
- [ ] `bun run lint` 通過
- [ ] 既存テストが壊れていないこと
- [ ] `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` でアニメーションをラップ
- [ ] `gsap-config.ts` から import（直接 import 禁止）
- [ ] テーマ変数使用（ハードコードカラー禁止）
- [ ] モバイル動作確認（DevTools）
- [ ] パフォーマンス確認（60fps目標）
