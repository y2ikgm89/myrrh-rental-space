---
paths:
  - src/app/(public*)/**
  - src/app/(admin)/**
---

# UI/UX パターンルール

> ui-ux-pro-max / frontend-design スキル対応

## 概要

フロントエンドUI実装時の品質を担保するためのスキル使用ガイドライン。
汎用的な「AIっぽい」デザインを避け、独自性のある高品質なUIを実現する。

## スキル配置

```
.agents/skills/ui-ux-pro-max/   # スキル本文・データの正本（リポジトリ同梱）
├── SKILL.md                    # スキル定義
├── scripts/
│   ├── search.py               # 検索スクリプト
│   └── core.py                 # コアロジック
└── data/                       # デザインデータベース
    ├── styles.csv              # 57種類のスタイル
    ├── colors.csv              # 95種類のパレット
    ├── typography.csv          # 56種類のフォントペアリング
    ├── charts.csv              # 24種類のチャート
    ├── ux-guidelines.csv       # UXガイドライン
    └── stacks/                 # スタック別ガイドライン
```

## スキル使用フロー

```
デザイン方針決定 → コンポーネント設計 → 実装
       ↓                  ↓              ↓
  ui-ux-pro-max    ui-ux-pro-max   frontend-design
```

## 検索コマンド

**Windows** では `python3` の代わりに **`py -3`**（Python Launcher）を使う。

```bash
# 基本検索
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain>

# スタック別ガイドライン
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack nextjs
```

### 検索ドメイン

| ドメイン     | 用途                   | キーワード例                             |
| ------------ | ---------------------- | ---------------------------------------- |
| `product`    | プロダクトタイプ推奨   | SaaS, e-commerce, dashboard, admin panel |
| `style`      | UIスタイル・エフェクト | glassmorphism, minimalism, dark mode     |
| `typography` | フォントペアリング     | elegant, professional, modern            |
| `color`      | カラーパレット         | saas, healthcare, fintech                |
| `landing`    | ページ構造・CTA        | hero, testimonial, pricing               |
| `chart`      | チャート推奨           | trend, comparison, funnel                |
| `ux`         | ベストプラクティス     | animation, accessibility, loading        |

### スタック

| スタック        | フォーカス                                             |
| --------------- | ------------------------------------------------------ |
| `html-tailwind` | Tailwindユーティリティ、レスポンシブ、a11y             |
| `react`         | State、hooks、パフォーマンス                           |
| `nextjs`        | SSR、ルーティング、画像最適化 **（このプロジェクト）** |
| `vue`           | Composition API、Pinia                                 |
| `svelte`        | Runes、stores、SvelteKit                               |
| `swiftui`       | Views、State、Navigation                               |
| `react-native`  | Components、Navigation                                 |
| `flutter`       | Widgets、State、Layout                                 |

## スキル使い分け

| タスク             | 使用スキル        | 検索例                                   |
| ------------------ | ----------------- | ---------------------------------------- |
| スタイル方針決定   | `ui-ux-pro-max`   | `--domain style "admin dashboard clean"` |
| カラーパレット設計 | `ui-ux-pro-max`   | `--domain color "saas professional"`     |
| フォントペアリング | `ui-ux-pro-max`   | `--domain typography "modern clean"`     |
| レイアウト設計     | `ui-ux-pro-max`   | `--domain ux "layout responsive"`        |
| コンポーネント実装 | `frontend-design` | -                                        |
| ページ実装         | `frontend-design` | -                                        |
| 既存UIレビュー     | `ui-ux-pro-max`   | `--domain ux "accessibility"`            |

## 必須使用シナリオ

### 1. 新規UIコンポーネント作成

```bash
# 1. スタイル検索
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "card dashboard" --domain style

# 2. UXガイドライン確認
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "hover animation" --domain ux

# 3. frontend-design で実装
```

### 2. ページ/画面の新規作成

```bash
# 1. プロダクトタイプ検索
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "admin dashboard" --domain product

# 2. レイアウト検索
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "layout responsive" --stack nextjs

# 3. frontend-design で実装
```

### 3. 既存UIの大幅リデザイン

```bash
# 1. 現状レビュー（UXガイドライン）
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "accessibility contrast" --domain ux

# 2. 改善スタイル検索
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "modern clean" --domain style

# 3. frontend-design で実装
```

## プロジェクト固有設定

### 技術スタック

- Next.js 16 + React 19
- Tailwind CSS 4（CSS-first設定）
- shadcn/ui（Radix UI + Tailwind Variants）
- Tabler Icons React（アイコン — `@tabler/icons-react`）

### CSSアーキテクチャ（Multiple Root Layouts）

**公開ページと管理画面は完全分離**:

```
src/app/
├── (admin)/_styles/admin.css    # 管理画面専用（固定: Swiss Industrial Admin）
└── (public)/_styles/public.css  # 公開ページ専用（AI生成でカスタマイズ）
```

#### 管理画面 (`admin.css`)

```css
@theme {
  /* Swiss Industrial Admin - Trust Blue パレット（固定）*/
  --color-primary: oklch(0.55 0.2 260);
  --color-sidebar-bg: oklch(0.18 0.03 260);
}
```

#### 公開ページ (`public.css`)

```css
@theme {
  /* 顧客ブランドに合わせてAI生成でカスタマイズ */
  --color-brand-primary: oklch(0.65 0.15 145);
  --color-primary: var(--color-brand-primary);
}
```

**注意**: `globals.css` は存在しない（削除済み）

### 検索時のスタック指定

```bash
# このプロジェクトではnextjsスタックを使用
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack nextjs
```

## 品質チェックリスト

### Visual Quality

- [ ] 絵文字をアイコンとして使用していない（SVG: Tabler Icons使用）
- [ ] アイコンサイズが統一されている（w-5 h-5 or w-6 h-6）
- [ ] ホバー状態でレイアウトシフトが発生しない
- [ ] テーマカラーを直接使用（bg-primary, text-foreground）

### Interaction

- [ ] クリック可能な要素に `cursor-pointer` がある
- [ ] ホバー状態で視覚的フィードバックがある
- [ ] トランジションが適切（150-300ms）
- [ ] フォーカス状態がキーボードナビゲーションで視認できる

### Light/Dark Mode

- [ ] ライトモードでテキストコントラストが十分（4.5:1以上）
- [ ] 透明要素がライトモードで視認できる
- [ ] ボーダーが両モードで視認できる

### Layout

- [ ] 固定要素の背後にコンテンツが隠れない
- [ ] レスポンシブ対応（375px, 768px, 1024px, 1440px）
- [ ] モバイルで水平スクロールが発生しない

### Accessibility

- [ ] 画像にalt属性がある
- [ ] フォーム入力にラベルがある
- [ ] 色だけで情報を伝えていない
- [ ] `prefers-reduced-motion` を尊重

## 禁止事項

1. **スキル未使用でのUI実装禁止**
   - 新規コンポーネント/ページ作成時は必ずスキルを使用
   - 小規模な修正（色変更、余白調整等）は例外

2. **汎用的なAIっぽいデザイン禁止**
   - グレー一色のカード
   - 単調なボタン配置
   - 差別化のないフォーム

   ```
   // NG: プロジェクトのアンチAIデザインガイド（anti-ai-design.md）に反する実装
   // - "Create beautiful and modern UI" という指示のみで実装
   // - デフォルトのシャドウ・グラデーション・角丸を無思考に使用

   // OK: .agents/skills/frontend-design を使用してプロジェクト固有の
   //     デザインシステムに沿った独自デザインを実装
   ```

3. **デザイン方針なしの実装禁止**
   - スタイル未決定での実装開始
   - 既存デザインとの整合性無視

   ```
   // NG: ChatGPT的な汎用実装
   // - ui-ux-pro-max / frontend-design スキルを使用せずに実装開始
   // - デザインブリーフなしでコンポーネントを作成

   // OK: /frontend-design <ComponentName> で Design Brief を作成してから実装
   ```

4. **ハードコードされたスタイル禁止**
   - `style={{ color: '#ff0000' }}` → Tailwind / テーマ変数使用
   - `gray-*`, `blue-*` 等 → `foreground`, `muted`, `primary` 等セマンティック変数使用
   - → `.claude/rules/tailwind-patterns.md` 参照

   ```tsx
   // NG: ハードコードされたカラー
   <div style={{ color: '#ff0000', backgroundColor: '#f3f4f6' }}>

   // OK: テーマ変数 + Tailwind ユーティリティ
   <div className="text-destructive bg-muted">
   ```

5. **絵文字アイコン禁止**
   - Tabler Icons React のSVGアイコンを使用

## 関連ルール・スキル

### Anti-AI デザイン

公開ページ UI 実装時は `.claude/rules/anti-ai-design.md` が自動ロードされる。
セルフレビュー質問（6問中3問以上 yes 必須）を必ず実施すること。

### frontend-design スキル

コンポーネント / ページの新規実装前に `/frontend-design <ComponentName>` を実行し、
Design Brief を作成してから実装に入る。

- スキル定義: `.agents/skills/frontend-design/SKILL.md`
- Anti-AI パターンカタログ: `.agents/skills/frontend-design/reference/anti-ai-patterns.md`

### Design System Memory

公開ページ UI 作業開始時に Serena memory `design-system` を読み取り、
既存のデザイン方針に従う。詳細は `.claude/rules/design-system-memory.md` 参照。

### マイクロインタラクション

hover、focus、modal 等のインタラクションパターンは
`docs/reference/claude-rules/micro-interactions-reference.md` を参照。
CSS 優先、GSAP は orchestrated sequence のみ。

## 参考

- `.agents/skills/ui-ux-pro-max/SKILL.md` - スキル詳細
- `.agents/skills/frontend-design/SKILL.md` - デザイン分析スキル
- `.claude/rules/anti-ai-design.md` - Anti-AI 強制ルール
- `.claude/rules/design-system-memory.md` - デザイン記憶プロトコル
- `docs/reference/claude-rules/micro-interactions-reference.md` - マイクロインタラクション
- `.claude/rules/tailwind-patterns.md` - Tailwind CSS 4ルール
- `.claude/rules/react-patterns.md` - React 19パターン
