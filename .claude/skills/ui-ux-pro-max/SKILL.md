---
name: ui-ux-pro-max
description: 付属データベースを検索して UI 方針を素早く集める。`frontend-design` の前段や UI レビュー時の補助として使う。
---

# ui-ux-pro-max

この skill は local CSV を検索して UI の方向付けを集めるためのもの。
ブランドの正本は `project-design-config.md` であり、この skill が上書きしてはいけない。

## 使う場面

- 新規 UI の方向性を決める前
- public / admin UI のレビュー観点を増やしたいとき
- typography / palette / layout / UX の候補を短時間で集めたいとき

## 使わない場面

- プロジェクト固有トークンを決め打ちしたいとき
- 単なる実装作業で、すでに方向性が決まっているとき
- 小規模修正（色変更、余白調整等）

## コマンド

ドキュメント例の `python3` は **Windows では `py -3` に読み替える**（Python Launcher）。macOS / Linux / Git Bash は `python3` のまま。既定 stack は `nextjs`。

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain>
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack nextjs
```

Windows（PowerShell / cmd）:

```powershell
py -3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain>
py -3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack nextjs
```

## ドメイン

| ドメイン     | 使いどころ                         |
| ------------ | ---------------------------------- |
| `product`    | 画面種別や業種の方向性             |
| `style`      | 見た目のトーン、レイアウト傾向     |
| `typography` | フォントペアリング                 |
| `color`      | カラーパレット候補                 |
| `landing`    | ページ構成や CTA 配置              |
| `chart`      | ダッシュボードの可視化             |
| `ux`         | アクセシビリティ、操作性、落とし穴 |

## スキル使い分け

| シナリオ           | 使用スキル        | コマンド例                          |
| ------------------ | ----------------- | ----------------------------------- |
| 新規UIの方向性決定 | `ui-ux-pro-max`   | `--domain product/style/typography` |
| レイアウト設計     | `ui-ux-pro-max`   | `--domain ux "layout responsive"`   |
| コンポーネント実装 | `frontend-design` | -                                   |
| ページ実装         | `frontend-design` | -                                   |
| 既存UIレビュー     | `ui-ux-pro-max`   | `--domain ux "accessibility"`       |

## 推奨フロー

1. まず `product` か `style` で方向を絞る
2. 必要なら `typography` と `color` を追加する
3. UI レビューでは `ux` を最後に引く
4. 実装前に結果を 3-5 行へ圧縮し、`frontend-design` の Design Brief に渡す

```
デザイン方針決定 → コンポーネント設計 → 実装
       ↓                  ↓              ↓
  ui-ux-pro-max    ui-ux-pro-max   frontend-design
```

## 必須使用シナリオ

### 1. 新規UIコンポーネント作成

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "card dashboard" --domain style
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "hover animation" --domain ux
# → frontend-design で実装
```

### 2. ページ/画面の新規作成

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "admin dashboard" --domain product
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "layout responsive" --stack nextjs
# → frontend-design で実装
```

### 3. 既存UIの大幅リデザイン

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "accessibility contrast" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "modern clean" --domain style
# → frontend-design で実装
```

## プロジェクト固有設定

### 技術スタック

- Next.js 16 + React 19
- Tailwind CSS 4（CSS-first設定）
- shadcn/ui（Radix UI + Tailwind Variants）
- Tabler Icons React（`@tabler/icons-react`）

### CSSアーキテクチャ（Multiple Root Layouts）

公開ページと管理画面は完全分離:

```
src/app/
├── (admin)/_styles/admin.css    # 管理画面専用（固定: Swiss Industrial Admin）
└── (public)/_styles/public.css  # 公開ページ専用（AI生成でカスタマイズ）
```

`globals.css` は存在しない（削除済み）。

## 出力のまとめ方

検索結果をそのまま貼らず、次の形に要約する:

- **Direction**: 何を目指すか
- **Typography**: どの対比を使うか
- **Color**: どの比率で使うか
- **Layout/Motion**: 何を強調し、何を抑えるか
- **Risks**: AIっぽさ、コントラスト不足、動き過多など

## 品質チェックリスト

実装後のセルフレビュー（path-scoped rules で自動チェックされる項目は省略）。

### Visual

- [ ] 絵文字をアイコンとして使用していない（Tabler Icons React 必須）
- [ ] アイコンサイズが統一（`w-5 h-5` or `w-6 h-6`）
- [ ] ホバー状態でレイアウトシフトが発生しない

### Interaction

- [ ] クリック可能要素に `cursor-pointer`
- [ ] ホバー状態で視覚的フィードバック
- [ ] トランジション 150-300ms
- [ ] キーボードナビでフォーカス可視

### Layout

- [ ] 固定要素の背後にコンテンツが隠れない
- [ ] レスポンシブ対応（375px / 768px / 1024px / 1440px）
- [ ] モバイルで水平スクロール発生しない

詳細な a11y / Tailwind / セマンティックカラー / 画像 alt 等は path-scoped rule (`frontend/accessibility/*` / `tailwind-patterns/*`) で自動ロードされる。

## 禁止事項

1. **スキル未使用でのUI実装禁止** — 新規コンポーネント / ページ作成時は必ず本 skill + `frontend-design` を経由（小規模修正は例外）
2. **汎用的な AI っぽいデザイン禁止** — グレー一色カード / 単調ボタン / 差別化のないフォーム → `.claude/rules/frontend/anti-ai-design.md` 参照
3. **デザイン方針なしの実装禁止** — `frontend-design` で Design Brief 作成してから実装
4. **絵文字アイコン禁止** — Tabler Icons React の SVG 使用

ハードコードカラー禁止 / セマンティックトークン必須は `tailwind-patterns/theme-tokens.md`（path-scoped）が canonical。

## ガードレール

- `project-design-config.md` と矛盾する提案をそのまま採用しない
- 管理画面の固定テーマを勝手に再設計しない
- raw search result を大量に貼らない
- `frontend-design` を飛ばして本 skill だけで実装判断を完了しない

## 関連

- `.claude/skills/frontend-design/SKILL.md` — Design Brief 作成
- `.claude/rules/frontend/project-design-config.md` — ブランド正本
- `.claude/rules/frontend/anti-ai-design.md` — Anti-AI 強制ルール（公開ページ path-scoped）
- `.claude/rules/frontend/design-system-memory.md` — Serena memory 記憶プロトコル
- `docs/reference/claude-rules/micro-interactions-reference.md` — マイクロインタラクション

## Done

- 必要最小限の domain だけ検索した
- 結果を短い判断材料へ圧縮した
- プロジェクト固有ルールとの整合性を確認した
- `frontend-design` で Design Brief を作成した
