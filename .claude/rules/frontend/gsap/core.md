---
description: GSAP コアルール（基本ルール・アニメーション定数・レスポンシブ規約・禁止事項・ファイル配置・Gotchas）
paths:
  - "src/app/(public*)/_shared/lib/gsap*"
  - "src/app/(public*)/_shared/lib/animations*"
  - "src/app/(public*)/_shared/components/providers/lenis-provider*"
  - "src/app/(public*)/_shared/lib/a11y/motion*"
  - "src/app/(public*)/_components/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
---

# GSAP パターン — コアルール

> GSAP 3 / @gsap/react 2 / ScrollTrigger / Lenis 1 対応（`package.json` と `bun.lock` の解決版に合わせる）

## レスポンシブ規約

| 機能             | デスクトップ                           | モバイル                        |
| ---------------- | -------------------------------------- | ------------------------------- |
| パララックス量   | `yPercent: 30`（PARALLAX.normal × 60） | `yPercent: 12`（× 0.4 に縮小）  |
| ピン固定         | `pin: true`                            | **禁止**（通常スクロール化）    |
| 横スクロール     | `pin: true + x`                        | **縦スクロールに変換**          |
| stagger          | `STAGGER.card = 0.12`                  | `STAGGER.element = 0.1`（短縮） |
| ビューポート単位 | `100svh`                               | `100svh`（`100vh` 禁止）        |

## 禁止事項

1. **reduced-motion 対応省略禁止** — 全アニメーションで `gsap.matchMedia()` パターン A / B を使用（→ `frontend/gsap/matchmedia/reduced-motion-and-bp.md`）
2. **`useEffect` 内での GSAP 使用禁止** — `useGSAP()` + `scope` を使用
3. **scope なしの `useGSAP()` 禁止** — `{ scope: containerRef }` は必須
4. **`gsap` / `gsap/ScrollTrigger` の直接 import 禁止** — `gsap-config.ts` 経由
5. **`useCallback` + `ref.current` の組み合わせ禁止** — イベントハンドラはプレーン関数で定義
6. **`Math.random()` 禁止** — 決定的ハッシュ関数を使用（React Compiler 互換）
7. **`invalidateOnRefresh` 省略禁止（`pin: true` 使用時）**
8. **scrub パララックスにカスタム ease 禁止** — `ease: 'none'`（リニア）を維持
9. **モバイルでの `pin: true` 禁止** — `gsap.matchMedia()` のブレークポイント分岐で回避
10. **`markers: true` の本番残存禁止**
11. **`top` / `left` プロパティのアニメーション禁止** — `x`, `y`, `xPercent`, `yPercent` を使用
12. **アニメーション定数（`animations.ts`）外のマジックナンバー禁止**
13. **リスト `.map` 内の個別 `<ScrollReveal delay={i * 0.08}>` wrap 禁止** — `ScrollRevealGroup`（1 ScrollTrigger + stagger）を使う（→ `frontend/gsap/matchmedia/events-and-stagger.md` §パターン D）

## ファイル配置

| パス                                                     | 内容                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `@/public/lib/gsap-config.ts`                            | GSAP 中央設定、プラグイン登録                                                |
| `@/public/lib/animations.ts`                             | DURATION / EASE / STAGGER / SCROLL_TRIGGER / PARALLAX 定数                   |
| `@/public/hooks/use-motion-preference.ts`                | `gsap.matchMedia()` ベースの reactive reduced-motion フック（パターン C 用） |
| `@/public/components/providers/SmoothScrollProvider.tsx` | Lenis + GSAP ticker 同期（`lenis/react` LenisContext 提供）                  |
| `@/public/components/animations/scroll-reveal.tsx`       | スクロール入場アニメーション（パターン A-1 の実装例）                        |
| `@/public/components/animations/split-text.tsx`          | テキスト分割スタガーアニメーション（パターン A-1 の実装例）                  |
| `@/public/components/animations/parallax-image.tsx`      | scrub パララックス画像（パターン A-1 の実装例）                              |
| `@/public/components/animations/magnetic-button.tsx`     | マウス追従マグネットボタン（パターン C の実装例）                            |

> **公式 GSAP リファレンス**: [gsap.com/docs/v3](https://gsap.com/docs/v3/) / [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) / [Accessibility](https://gsap.com/resources/a11y)

## Gotchas

- **`gsap.from(el, { opacity: 0 })` 禁止 — `gsap.fromTo` を使用** — `gsap.from` は要素に `opacity: 0` をインラインセットするため、GSAP が発火しない場合（SSR、reduced-motion、ScrollTrigger 未到達）にコンテンツが不可視のまま。`gsap.fromTo(el, { opacity: 0 }, { opacity: 1 })` なら CSS デフォルト `opacity: 1` が保持される
- **`ScrollReveal` ラッパー内のカードに `border-b last:border-b-0` 禁止** — `:last-child` を壊し、全カードで最後の線が消える。親要素に `divide-y divide-border` を使用
- **`ScrollReveal` の子（または `className`）に `mt-auto` 等の親 flex 依存の遅延レイアウトを使うと `opacity:0` で永久待機** — `ScrollReveal` は要素自身を ScrollTrigger の trigger にする。`md:mt-auto`（flex セル底寄せ）等で位置が初期レンダリング後に確定する場合、ScrollTrigger の初期計算時に最終位置が未確定で start 判定がずれ、fold 内でも発火せず要素が `opacity:0` + `translateY(24px)` のまま不可視になる silent bug（CTA ボタンが消える等、`getComputedStyle(wrapper).opacity === "0"` で検出）。**対処: 位置が初期レンダリングで確定する固定マージン（`mt-12 md:mt-16` 等）を使う**（`mt-auto` での底寄せは不可）。実例: 2026-06-04 `EditorialSplitHero` の CTA ボタンを `md:mt-auto` で底寄せ → opacity 0 待機 → 固定 `md:mt-16` に変更して解消
- **テキストの DOM 分割（SplitText 風）は禁止** — `<span class="inline-block">` に分割すると日本語テキストが縦折れ + SSR ↔ Client の hydration mismatch。SplitText はコンテナ全体の fade-up のみ
- **Cormorant Garamond の letter-spacing は負値または 0** — 正の letter-spacing は日本語フォールバック（Noto Sans JP）にも適用され横に広がる。`-0.01em` 以下を使用
- **`font-heading` (Cormorant Garamond) で数字+漢字の混合テキスト禁止** — ベースラインがずれる。`font-sans` + `tracking-wide` で可読性確保
- **`useGSAP` 外の GSAP アニメーションには `useEffect` cleanup 必須** — イベントハンドラ直接呼出時は `gsap.killTweensOf(element)` を cleanup で呼ぶ
- **`useGSAP` + `dependencies` で状態駆動アニメーションを実装しない** — dependency 変更ごとに `gsap.context()` が revert してフラッシュ。タイマー/クリック駆動は Pattern C（→ `frontend/gsap/matchmedia/events-and-stagger.md`）
- **`exhaustive-deps` は `react-hooks` と `@eslint-react` の 2 つが有効** — `eslint-disable-next-line react-hooks/exhaustive-deps` では `@eslint-react/exhaustive-deps` が残る。`useEffectEvent`（React 19 stable）で根本解決
- **`useEffect` 内のイベントリスナーから状態変更関数を呼ぶ場合は `useEffectEvent` でラップ** — `const onSwipe = useEffectEvent((dir) => navigate(dir))` で effect 内では `onSwipe` を呼ぶ。`useEffectEvent` の戻り値は deps 配列に含めない
