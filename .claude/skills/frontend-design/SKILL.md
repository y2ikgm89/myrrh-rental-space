---
name: frontend-design
description: UI実装前のデザイン分析。プロジェクトのブランドに即した独自UIを実現
argument-hint: <ComponentOrPageName>
---

# frontend-design スキル

> コンポーネント / ページ実装前のデザイン分析 + Anti-AI 強制。確立済みデザインシステムを前提とする。

## 前提条件

1. Serena memory `design-system` を `read_memory('design-system')` で読み込む
2. Memory がない場合、`project-design-config.md` をデフォルトとする

### 使用可能なアニメーションコンポーネント

`project-design-config.md` §モーション設計 に定義されたコンポーネントを使用。
一般的な構成:

| コンポーネント | 用途 |
|--------------|------|
| `SplitText` | 見出し reveal (chars/words/lines) |
| `ScrollReveal` | 汎用入場 (y + opacity) |
| `ParallaxImage` | スクロール連動画像移動 |
| `MagneticButton` | CTA マウス追従 |
| `ScrollIndicator` | Hero 下部スクロールヒント |
| `SectionLabel` | 装飾付きラベル |

---

## Step 1: Pre-coding Analysis

### 1.1 目的分析

このコンポーネント / ページが **伝えるべきこと** を一文で定義する。

### 1.2 ターゲット定義

- **誰に**: ターゲットユーザー
- **どんな感情を**: 信頼、上質感、安心、期待 等

### 1.3 ムード確認

`project-design-config.md` §ブランド のムードが確立済み。新セクション/ページもこの方向に従う。
大きく逸脱する場合はユーザーに確認。

| ムード | 特徴 |
|--------|------|
| `warm-minimal` | 暖色ニュートラル、丸みのあるサンセリフ body、柔らかい影 |
| `elegant` | Serif heading、余白贅沢、控えめアクセント |
| `japanese-modern` | 和の余白 + モダンタイポ |

### 1.4 コンポジション制約（2-3 個選択）

| 制約 | 説明 |
|------|------|
| **Scale contrast** | heading と body のサイズ差 4x+ |
| **Typographic hierarchy** | 複数フォントファミリーの対比 |
| **Intentional tension** | グリッドを 1 箇所破る |
| **Negative space mastery** | 40%+ の余白 |
| **Depth layering** | z-index 重なり |
| **Directional flow** | 視線誘導パターン |
| **Asymmetric balance** | 視覚的重さでバランス |

---

## Step 2: デザインリファレンス検索

### 2.1 WebSearch（必要時のみ）

既存パターンで対応できない場合に検索。

### 2.2 ui-ux-pro-max 検索

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain style --stack nextjs
```

### 2.3 既存コンポーネントからの参照

新セクション作成時は、まず公開ページの既存セクションを参照。

---

## Step 3: Design Brief 出力

以下のフォーマットでユーザーに提示し、承認を得てから実装に進む。

```markdown
## Design Brief: {ComponentName}

**Purpose**: [一文で目的]
**Mood**: (project-design-config.md のムード / 変更がある場合は明記)
**Composition constraints**: [2-3 個]
**Anti-AI checks**: [このコンポーネント固有の回避パターン]

### 既存コンポーネント再利用
- SplitText: [使う / 使わない + variant]
- ScrollReveal: [使う / 使わない]
- ParallaxImage: [使う / 使わない + speed]
- MagneticButton: [使う / 使わない]
- SectionLabel: [使う / 使わない + テキスト]

### Typography
(project-design-config.md §タイポグラフィ から)

### Color Allocation
(project-design-config.md §カラーパレット から)

### Motion Plan
- **主役**: [SplitText variant + 対象テキスト]
- **脇役**: [ScrollReveal + 対象要素]
- **静止**: [何が動かないか]
- **入場順序**: [具体的順序]

### Reference
- 既存: [参照したセクション名]
- 外部: [URL（あれば）]
```

---

## Step 4: 実装

### 4.1 テーマトークン

公開ページ CSS の `@theme` 変数を使用。ハードコード禁止。

### 4.2 アニメーション定数

`animations.ts` の DURATION / EASE / STAGGER / SCROLL_TRIGGER / PARALLAX を import。
マジックナンバー禁止。

### 4.3 GSAP パターン

`gsap.matchMedia()` パターン A を使用（`gsap-patterns.md` 参照）:

```typescript
useGSAP(() => {
  const mm = gsap.matchMedia()
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    // アニメーション
  })
}, { scope: containerRef })
```

### 4.4 レスポンシブ

`project-design-config.md` §セクション設計 に準拠。

---

## Step 5: Post-Implementation Review

### 5.1 Anti-AI セルフレビュー

`.claude/rules/anti-ai-design.md` のセルフレビュー 6 問を実施。3 問以上 yes → PASS。

### 5.2 Design Brief との整合性

- Brief で指定した animation コンポーネントが使われているか
- Brief で指定した color allocation が守られているか
- DURATION/EASE/STAGGER 定数を使っているか（マジックナンバーなし）

### 5.3 Design System Memory 更新

新しい規約（新コンポーネント種別、新パターン）が生まれた場合:

```
edit_memory('design-system', ...)
```

---

## Definition of Done

- [ ] `bun run type-check` 通過
- [ ] `bun run lint` 通過
- [ ] Anti-AI セルフレビュー 3/6 以上 PASS
- [ ] Design Brief との整合性確認済み
- [ ] アニメーション定数使用（マジックナンバーなし）
- [ ] `reduced-motion` 対応（`gsap.matchMedia()` パターン A/B/C）

## 参照ファイル

| ファイル | 内容 |
|----------|------|
| `.claude/rules/project-design-config.md` | プロジェクト固有デザイン値 |
| `.claude/rules/anti-ai-design.md` | Anti-AI 強制ルール |
| `.claude/rules/design-system-memory.md` | デザイン記憶プロトコル |
| `.claude/rules/gsap-patterns.md` | GSAP / ScrollTrigger |
| `docs/reference/claude-rules/micro-interactions-reference.md` | マイクロインタラクション標準 |
