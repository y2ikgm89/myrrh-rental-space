---
name: frontend-design
description: 公開ページの新規 UI や大幅なリデザイン前に使う。ブランド、anti-AI、再利用方針を短い design brief に落としてから実装する。
when_to_use: 公開ページの新規 UI 追加・大幅リデザイン・配色やタイポグラフィの方針変更の前に。実装着手前の brief 整理が目的。
paths:
  - src/app/(public)/**/*.tsx
  - src/app/(public)/**/*.css
---

# frontend-design

`src/app/(public*)/**` の新規セクション、新規ページ、大幅なリデザインで使う。
微調整だけの修正では使わなくてよい。

## 先に読む

1. `.claude/rules/frontend/project-design-config.md`
2. `.claude/rules/frontend/anti-ai-design.md`
3. `.claude/rules/frontend/design-system-memory.md`
4. デザイン方向性収集には `ui-ux-pro-max` skill
5. モーションが主役なら `.claude/rules/frontend/gsap/*.md`
6. パターン例が必要なら `reference/anti-ai-patterns.md`

## 入力

- 何を伝える UI か
- 誰向けか
- どの route / component に置くか
- モーションが必須か、装飾か

## ワークフロー

1. 既存の近いセクションやページを読む
2. 目的を 1 文で定義する
3. `project-design-config.md` からムードを選び、逸脱するなら明示する
4. コンポジション制約を 2-3 個決める
5. 既存パターンだけでは不足する場合のみ `ui-ux-pro-max` を狭いキーワードで検索する
6. 実装前に短い Design Brief を出す

```markdown
## Design Brief: {Name}

- Purpose: ...
- Mood: ...
- Composition: ...
- Reuse: ...
- Motion: ...
- Anti-AI checks: ...
```

7. 実装では既存トークン、既存 UI、既存 animation primitive を優先して使う
8. データ取得が必要なら `src/shared/domain/*` を正本にし、公開側には必要最小限の `src/app/(public)/_shared/data/*` だけを置く
9. 強い演出が必要なら `src/app/(public)/layout.tsx` を重くせず、ページ／セクション単位のコンポーネントに閉じ込める（ルート shell は `AGENTS.md` の現行構成に従う）
10. 新しい project-wide 規約が必要になったら、承認後に `project-design-config.md` か関連 `codex-rules` を更新する

## 検索コマンド例

Windows では `python3` を **`py -3`** に読み替える（理由と例はリポジトリ直下 `AGENTS.md` の Setup を参照）。

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "luxury hospitality editorial" --domain style
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "warm elegant serif" --domain typography
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "scroll accessibility" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "layout responsive" --stack nextjs
```

## レスポンシブ判断基準（Tailwind v4 公式準拠）

Design Brief 作成時にレスポンシブ挙動を決める場合、**Container Query vs viewport breakpoint** を明示する:

| 対象                                                           | 判定                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| Hero split（左画像 + 右テキスト）                              | viewport (`md:`)                                      |
| 2 カラム text+image マクロレイアウト                           | viewport (`md:`)                                      |
| フォームグリッド（名前: 姓/名、時間: 開始/終了）               | viewport (`sm:`)                                      |
| カードグリッド（Space / Post / News / Event / Testimonial 等） | **Container Query (`@container` + `@md:` / `@3xl:`)** |
| ダッシュボード widget（admin dashboard cards）                 | **named container (`@container/main` + `@md/main:`)** |
| Sidebar 持ちレイアウトで main content が追従すべき要素         | **named container**                                   |

- **3xl breakpoint**（1920px, ultra wide / 2K-4K）は default 採用。`2xl:` 以上のワイドスクリーン対応は `@3xl:` or `3xl:` を使う
- breakpoint tokens / container tokens / touch-target token は `public.css` / `admin.css` の `@theme` を参照（→ `project-design-config.md` §レスポンシブ設計）
- タッチターゲットは WCAG 2.5.5 Enhanced (AAA) 44×44 CSS px — Button 全 size で `min-h-11` 以上を保証（→ `frontend/accessibility/touch-text.md`）

## ガードレール

- クライアントで `useSyncExternalStore`（ストレージ同期など）を足すときは `react/hooks.md`: **`getServerSnapshot` で `return []` / `return {}` 禁止**（モジュール定数で参照を固定）。空配列の実装例は `announcement-bar/use-dismissed-bars.ts`
- ハードコードカラーや場当たりのフォントスタックを足さない
- Generic hero、均一カードグリッド、過剰な gradient をデフォルトにしない
- モーションの定数は共有実装を使い、マジックナンバーを増やさない
- `prefers-reduced-motion` を無視しない
- `src/app/(public)/layout.tsx` に新しい effect provider や scroll provider を直接積まない
- **nuqs 以外**の URL state 用 Context を public root に足さない。既存の **`NuqsAdapter`**（nuqs）は維持前提（二重ラップも禁止）。`.claude/rules/nuqs-patterns.md`
- 公開 UI のために `@/shared/db/prisma` や新規 `public/_shared/actions` を足さない
- 完了済み plan（`git log --all --diff-filter=D -- docs/superpowers/plans/<file>` で辿れる削除済 file）を現行ルールとして引用しない
- 永続化が必要な判断を hidden state に置かず、ドキュメントに残す

## Done

- Design Brief を出した
- `anti-ai-design.md` のセルフレビューを通した
- theme token / semantic token / shared animation を使った
- 必要な設計判断を `codex-rules` 側へ反映した
- `bun run validate` を実行した
