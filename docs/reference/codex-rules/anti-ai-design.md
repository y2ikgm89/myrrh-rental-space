---
paths:
  - src/app/(public*)/**
---

# Anti-AI デザイン強制ルール

> Codex 用参照ドキュメント。公開ページ UI の anti-AI ガードレールはこのファイルを正本とする。

## デザイン言語の参照

ルール適用前に、確立されたデザイン言語を前提とする。

→ **`project-design-config.md`** にブランド固有値（カラー、タイポグラフィ、モーション、コンポーネント規約）を集約。

---

## 禁止パターン表

| カテゴリ       | AI Default（禁止）                         | プロジェクト推奨パターン                                                                                   |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Layout**     | 等幅 3 カラム `grid-cols-3` 全カード同高さ | 非対称グリッド（テキスト + ParallaxImage）、カード grid は `gap-6 md:gap-8` で呼吸                         |
| **Typography** | Sans 単一フォント、16/20/24px 均等ステップ | Serif heading (`font-heading`) + Sans body、4x+ スケール差（→ `project-design-config.md` §タイポグラフィ） |
| **Color**      | 3 色均等配分、全面グラデーション           | Dominant/Support/Accent 比率を遵守（→ `project-design-config.md` §カラーパレット）。Accent は限定箇所のみ  |
| **Motion**     | 全要素 `fade-in-up`、同一 duration/easing  | 主役/脇役/背景の役割分担（→ `project-design-config.md` §モーション設計）。`animations.ts` 定数使用         |
| **Corners**    | 全要素 `rounded-lg` 統一                   | コンテナ/画像: `rounded-lg`。CTA: `rounded-full`。セクション境界: sharp                                    |
| **Buttons**    | 全ボタン pill gradient、同一スタイル       | CTA/Secondary/Form の3段階ヒエラルキー（→ `project-design-config.md` §コンポーネント規約）                 |

---

## モーション禁止パターン（`animations.ts` 準拠）

- **全要素アニメーション禁止** — 1 セクションで動く要素は最大 3 箇所
- **`EASE` 定数外の easing 禁止** — `animations.ts` で定義された easing のみ使用
- **`STAGGER` 定数外の stagger 禁止** — `animations.ts` で定義された stagger のみ使用
- **fade-in-up 一辺倒禁止** — SplitText + ScrollReveal + ParallaxImage を組み合わせ
- **同時発火禁止** — `ScrollReveal delay={0.1}` `delay={0.2}` で時差をつける

## コンポーネント禁止パターン

- **均一シャドウカード** — `shadow-md` 統一禁止。`border border-border bg-card` + `hover:shadow-lg` 遷移
- **絵文字装飾** — Lucide React SVG を使用（`ui-ux-patterns.md` と同一）
- **ストックフォト等間隔グリッド** — 画像アスペクト比に変化をつける。hover で `scale-105`
- **汎用 hero: 中央タイトル + 2 ボタン** — パララックス背景 + gradient overlay + SplitText + 単一 CTA + ScrollIndicator

---

## セルフレビュー質問（6 問中 3 問以上 yes 必須）

実装完了後に確認。3 問未満 → Design Brief に戻り再設計。

1. **タイポグラフィに serif/sans の対比があるか？** — heading と body で異なるフォントファミリー
2. **Accent カラーが控えめ（15% 以下）か？** — 限定された箇所（ラベル、CTA、価格等）のみ
3. **セクション間で padding に変化があるか？** — Hero と通常セクションで異なるスペーシング、背景切替あり
4. **アニメーションに主役/脇役の差があるか？** — SplitText=主役 / ScrollReveal=脇役 / 画像=静止 or パララックス
5. **カードに hover のインタラクションがあるか？** — image scale + container shadow 遷移
6. **セクションラベルに統一された装飾があるか？** — `SectionLabel` コンポーネント等の一貫した処理

---

## 実装時の適用フロー

```
1. `project-design-config.md` と `design-system-memory.md` を確認
2. `.agents/skills/frontend-design/SKILL.md` で Design Brief 作成
3. Design Brief の Anti-AI checks を確認
4. animations.ts の定数を使用して実装
5. セルフレビュー質問（3/6 以上 yes）
6. 不合格 → Design Brief に立ち戻り再設計
```

## 参照

- `docs/reference/codex-rules/project-design-config.md` — プロジェクト固有デザイン値
- `(public*)/_styles/public*.css` — テーマ変数
- `(public*)/_shared/lib/animations.ts` — DURATION / EASE / STAGGER / PARALLAX 定数
- `(public*)/_shared/components/animations/` — SplitText, ParallaxImage, MagneticButton, ScrollReveal
- `.agents/skills/frontend-design/SKILL.md` — 実装前デザイン分析スキル
- `.agents/skills/frontend-design/reference/anti-ai-patterns.md` — 詳細パターンカタログ
- `docs/reference/codex-rules/ui-ux-patterns.md` — UI / UX の補助ルール
