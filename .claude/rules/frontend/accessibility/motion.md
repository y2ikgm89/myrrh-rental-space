---
description: Accessibility — prefers-reduced-motion (WCAG 2.3.3) + 自動回転カルーセルの停止手段 (WCAG 2.2.2 Pause, Stop, Hide)
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
  - "src/app/(public*)/_shared/hooks/use-motion-preference.ts"
---

# Accessibility — prefers-reduced-motion

全アニメーションは `prefers-reduced-motion` を尊重する（WCAG 2.3.3 / 公開サイト必須）。GSAP は必ず `gsap.matchMedia()` でラップし、reduce 時は不介入（要素は CSS デフォルトで表示）にする。`mm` を使わず直接 `gsap.from(...)` / `gsap.to(...)` するのは NG。

## 実装パターンの SSoT

GSAP matchMedia の具体実装（コード・選択ガイド）は `frontend/gsap/matchmedia/` が SSoT。本ファイルは accessibility 要件の宣言に留める:

- **パターン A**（reduce 時スキップ A-1 / conditions 分岐 A-2）+ **パターン B**（レスポンシブ breakpoint）→ [`../gsap/matchmedia/reduced-motion-and-bp.md`](../gsap/matchmedia/reduced-motion-and-bp.md)
- **パターン C**（イベント / タイマー駆動、`useMotionPreference` ReactiveRef、`useCallback` 禁止）+ **パターン D**（リスト stagger `ScrollRevealGroup`）→ [`../gsap/matchmedia/events-and-stagger.md`](../gsap/matchmedia/events-and-stagger.md)

## ScrollReveal（パターン A 実装済みコンポーネント）

`ScrollReveal` / `ScrollRevealGroup` は `gsap.matchMedia` 対応済みのため、追加対応なしで直接使用できる:

```tsx
// OK: ScrollReveal は reduced-motion を自動でスキップ
<ScrollReveal delay={0.2}>
  <p>このテキストはスクロールで出現</p>
</ScrollReveal>
```

## 自動回転・自動更新コンテンツ（WCAG 2.2.2 Pause, Stop, Hide / Level A）

カルーセル・スライドショー等で「**自動開始・5 秒超・他コンテンツと並行**」して動く / 更新する UI は、[WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)（Level A）で **一時停止 / 停止 / 非表示のいずれかの手段が必須**。`prefers-reduced-motion` 尊重（§上記 = WCAG 2.3.3）や hover / focus 停止だけでは**不十分** — reduce 未設定ユーザー・タッチユーザーをカバーせず、hover は WCAG の言う「手段（mechanism）」に当たらない。これは reduced-motion とは独立した別 SC。

[W3C ARIA APG Auto-rotating Carousel](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) 準拠の必須要件:

- **明示的な一時停止 / 再生コントロール（ボタン）を必ず置く** — 2.2.2 を満たす唯一確実な手段（タッチ / キーボード / マウス全員が到達できる）
- **キーボードフォーカスがカルーセルに入ったら停止**し、ユーザーの明示操作まで再開しない
- **ホバー中は停止**（離れたら再開）
- **`prefers-reduced-motion` では自動回転しない**（先頭スライド静止、タイマー自体を起動しない）
- スライドコンテナは `aria-live`（回転中 `off` / 停止中 `polite`）で SR スパムを防ぐ

**自動回転をやめて手動のみ（ボタン / スワイプ / 矢印）にすれば 2.2.2 の対象外**になり、停止コントロールは不要（editorial hero では有力な選択肢）。「ボタンが要る / 要らない」は実質「**自動回転を残すか**」で決まる。

### canonical 実装（GSAP Pattern C + useSyncExternalStore）

- reduced-motion は `useSyncExternalStore`（React 19 公式の matchMedia 購読、module-scope subscriber で参照安定）で **reactive state** として読む。`useMotionPreference`（ref）は event-time 読みには使えるが、「自動回転の有効/無効を render に反映」する用途には state が必要（→ `react/hooks/external-store.md`）
- 自動送りは **GSAP 単一 tween** で進捗バーを `scaleX 0→1` させ `onComplete` で前進すると、進捗の可視化と送りタイミングが完全同期する（`setInterval` 不要、タブ非表示は rAF 停止で自然に一時停止）。hover / pause / focus は `tween.pause()` / `resume()` で制御。Pattern C（`gsap.to` 直接 + `killTweensOf` cleanup）に準拠
- スライドピッカーは APG **grouped buttons**（`role="group"` + 各 `<button>` + 現在スライド `aria-disabled`）。`role="tab"` 単独使用は禁止（→ `semantics/html-elements.md` §カルーセルのスライドピッカー）

参照実装: `_shared/components/page-hero/EditorialSplitHero.tsx`（進捗バー + 停止ボタン + hover/focus 停止 + reduced-motion off、2026-06-04 確立の canonical）。

### 同 pattern 適用対象（自動回転を持つが停止手段が不完全 — 要追随）

新規カルーセル追加時はこの canonical に揃える。下記既存コンポーネントも同 pattern へ追随する（design 影響があるため個別判断）:

- `_shared/components/page-hero/hero-background-slideshow.tsx` — 全面背景スライドショー。停止ボタン・hover/focus 停止なし（reduced-motion off のみ）→ 2.2.2 未達
- `_components/space-showcase/_spaces-carousel.tsx` — hover/focus 停止 + reduced-motion off + tab 非表示停止はあるが**明示的停止ボタンなし** → タッチ/マウス専用ユーザーに手段なし（2.2.2 partial）
- `_shared/components/announcement-bar/announcement-bar.tsx` — `pauseOnHover` が設定依存 + 明示停止ボタン・reduced-motion 連動なし

検出 grep（自動送りするが明示的 pause/再生コントロールを持たない疑いを精査）:

```bash
# 自動送り（setInterval / setTimeout で advance、autoPlayInterval）の UI を列挙
grep -rlnE 'setInterval|setTimeout\(|autoPlayInterval' src/app/\(public\) --include="*.tsx" \
  | grep -iE 'carousel|slideshow|hero|announcement'
# 各 hit に「一時停止 / 再生」aria-label を持つボタンがあるか確認（無ければ 2.2.2 未達の疑い）
```
