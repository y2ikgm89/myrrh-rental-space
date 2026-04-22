---
name: large-file-detector
description: >
  プロジェクト内で分割推奨サイズを超えたファイルを検出する。
  Server Action ファイル（queries.ts / mutations.ts 分割対象）と
  Client Component ファイル（責務別分割対象）の両方をスキャン。
  「大きなファイルを調べて」「肥大化した component を確認して」「分割対象を探して」
  「split-action-file の対象を調べて」場面で使用。
tools:
  - Glob
  - Bash
model: sonnet
memory: project
---

# large-file-detector

肥大化ファイルを 2 系統に分けて検出する。

1. **Server Action ファイル**: `src/**/actions/**/*.ts` と `src/**/_shared/actions/**/*.ts` 配下の `.ts` ファイル（barrel `index.ts` / サブディレクトリ除く）。500 行超で `split-action-file` skill の対象。
2. **Client Component ファイル**: `src/app/(admin)/**/_components/**/*.tsx` と `src/app/(public)/**/_components/**/*.tsx` 配下。700 行超で責務別分割の対象（CLAUDE.md §subagent-driven-development のセッション実績: `TaxonomyEditor.tsx` 853→353、`EventForm.tsx` 658→177、`SidebarSection.tsx` 790→467、`TermsInlineEditor.tsx` 791 削除）。

## 実行手順

1. **Server Action スキャン**: `src/**/actions/**/*.ts` を Glob → `wc -l` → 500 行超を抽出
2. **Client Component スキャン**: `src/app/**/_components/**/*.tsx` を Glob → `wc -l` → 500 行超を抽出
3. **除外**: `*.test.ts` / `*-types.ts` / `index.ts` barrel / `schema.ts`（登録 registry は SSoT のため許容）
4. ソートしてサイズ別に優先度付けして報告

## 報告フォーマット

```
## Server Action 分割対象

| ファイル | 行数 | 優先度 | 推奨アクション |
|---------|------|--------|---------------|
| post/actions.ts | 732 | 🔴 高（700L+）| /split-action-file で queries.ts + mutations.ts 分割 |
| event/actions.ts | 582 | 🟡 中（500-699L）| /split-action-file で分割 |

## Client Component 分割対象

| ファイル | 行数 | 優先度 | 推奨アクション |
|---------|------|--------|---------------|
| posts/taxonomy/_components/TaxonomyEditor.tsx | 853 | 🔴 高（850L+） | Outer/Inner Split + Dialog/FormFields 抽出 |
| settings/_components/sections/SidebarSection.tsx | 790 | 🟠 中高（700-849L） | sub-directory 分割（DnD / Dialog / Card） |
| events/_components/EventForm.tsx | 658 | 🟡 中（500-699L） | Field group 抽出（Basic / Schedule / Selector / Publish） |

合計: Server Action N ファイル / Client Component M ファイルが分割推奨サイズを超えています。
```

## 優先度基準

### Server Action (.ts)

| 行数     | 優先度                      |
| -------- | --------------------------- |
| 700L+    | 🔴 高                       |
| 500-699L | 🟡 中                       |
| 300-499L | 🟢 注意（将来的な分割候補） |

### Client Component (.tsx)

| 行数     | 優先度                      |
| -------- | --------------------------- |
| 850L+    | 🔴 高                       |
| 700-849L | 🟠 中高                     |
| 500-699L | 🟡 中                       |
| 300-499L | 🟢 注意（将来的な分割候補） |

## 例外（分割不要）

以下は大きくても分割しない:

- `src/shared/lib/terms-templates.ts` — 規約テンプレ SSoT（8 種類の HTML 集約、SSoT 性のため分割禁止）
- `src/shared/lib/validations/section.ts` — セクション schema registry（22 種類の SSoT）
- `src/shared/lib/validations/enums/helpers.ts` — 全 enum ラベル・ヘルパー SSoT
- `src/shared/lib/nuqs/parsers.ts` — nuqs パーサーマップ SSoT
- Lexical plugin の単一ファイル（`lexical-draggable-block-plugin.ts` 等、plugin の単一責務）

これら SSoT 系は規律として「1 ファイル = 1 責務」を守っているため、行数で測らない。

## 分割後の注意

- **後方互換 re-export / barrel の `export *` 禁止**（CLAUDE.md ハードルール）— 呼び出し元を直接 import に書き換える
- **`useCallback` / `useMemo` / `memo` を追加しない**（React Compiler 1.0 自動メモ化）
- **sub-component の命名は `<Parent><Role>.tsx`**（例: `EventBasicFields.tsx`、`SidebarWidgetCard.tsx`）
- **Outer/Inner Split 適用時は outer から hooks 除去**（CLAUDE.md §react-patterns）
- **Thin mode dispatcher は clean-break 削除**（ADR 0015 §D1、`TermsInlineEditor` 事例）
