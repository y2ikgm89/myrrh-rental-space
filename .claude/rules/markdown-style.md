---
description: md ファイル記述スタイル規律 — CommonMark 0.31.2 + GFM + markdownlint 主要ルール準拠 / プロジェクト固有 drift 防止
paths:
  - "**/*.md"
---

# Markdown Style — 公式仕様準拠の記述規律

公式仕様（[CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) + [GitHub Flavored Markdown](https://github.github.com/gfm/)）と [markdownlint](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md) 主要ルールに準拠する。CI lint は未導入のため編集時にレビューで担保。

## 構造規律（プロジェクト固有 — drift 防止）

| ルール                                          | 理由                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **バージョン値の md 内ハードコード禁止**        | SSoT は `package.json` + `bun.lock`。`Next.js 16.2.6` 等の minor バージョン記述は `bun update` で drift           |
| **「最終更新: YYYY-MM-DD」マーカー禁止**        | 手動メンテで drift する dead marker、履歴は `git log` SSoT                                                        |
| **`.archive/` ディレクトリ再導入禁止**          | 完了済 plan/spec は削除し `git log --all --diff-filter=D -- <path>` で辿る                                        |
| **`docs/reference/` 再導入禁止**                | library API reference は公式 docs を直接参照、project pattern は `.claude/rules/**` / `.agents/skills/**` が SSoT |
| **`docs/how-to/` はインフラ・デプロイ手順のみ** | DB migration / auth / Lexical 等の実装手順は rule docs / skills に集約                                            |
| **絶対パスでの cross-doc リンク優先**           | `[label](./relative.md)` で書き、bare URL は `<>` で囲む（`MD034`）                                               |

## 記述スタイル（markdownlint 主要ルール）

公式の主要ルールに従う:

- **見出し階層** — `#` (h1) は 1 ファイル 1 個のみ (`MD025`)、レベルスキップ禁止 (`MD001`、h2 → h4 不可)、開始は h1 (`MD041`)
- **コードフェンス言語タグ必須** — \`\`\`bash / \`\`\`typescript / \`\`\`text 等を明示 (`MD040`)。GFM syntax highlight + アクセシビリティのため
- **bare URL は `<>` で囲む** — `<https://example.com>` または `[label](url)` 必須、bare `https://example.com` 禁止 (`MD034`)
- **行末空白禁止** — 改行は `<br>` HTML タグで明示 (`MD009`)
- **複数連続空行禁止** — 1 空行のみ (`MD012`)
- **リスト記号統一** — bullet は `-` 固定（`*` / `+` 混在禁止 `MD004`）、ordered list は `1.` 連続使用（auto-renumber 任せ `MD029`）
- **テーブルは GFM 構文** — header / separator / row の column 数一致、align 記号統一 (`:---` / `---:` / `:---:`)
- **改行コード LF 固定** — `.gitattributes` で `*.md text eol=lf` 強制（`git diff` の `LF will be replaced by CRLF` warning 抑止）
- **絵文字は user 明示要求時のみ** — 表中の `✅` / `❌` 等の状態表現は許容、装飾目的の絵文字は禁止

## Frontmatter スキーマ参照

5 層構造（Memory / Rule / Subagent / Skill / Hook）の公式 frontmatter 仕様は [`claude-code-patterns.md`](./claude-code-patterns.md) §公式 5 層 / frontmatter を SSoT とする。Codex 側 (`AGENTS.md` / `.agents/skills/**` / `.codex/agents/**`) の frontmatter は [`AGENTS.md`](../../AGENTS.md) §Codex Project Assets を参照。

## 検証

CI lint は未導入。手動チェックは以下:

```bash
# 行末空白検出
grep -rnE ' +$' --include='*.md' .

# 連続空行検出
grep -rzPn '\n\n\n+' --include='*.md' . | head

# bare URL 検出（http(s) で `<>` / `[]()` で囲まれていないもの）
grep -rnE '(^| )https?://[^ )>]+' --include='*.md' . | grep -vE '<https?://|\]\(http' | head
```

将来 CI 導入する場合は [`markdownlint-cli2`](https://github.com/DavidAnson/markdownlint-cli2) を `package.json` の devDependency に追加し `lint:md` script + workflow job を作る。
