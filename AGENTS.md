# AGENTS.md

このリポジトリの **AI エージェント向け指示の正本（SSoT）は [`CLAUDE.md`](./CLAUDE.md)** です。

OpenAI Codex など [agents.md](https://agents.md) 互換ツールは本 `AGENTS.md` をエントリポイントとして読み込みますが、規約の重複（drift）を避けるためルールは複製しません。**作業前に必ず [`CLAUDE.md`](./CLAUDE.md) を読み、その指示に従ってください。**

- ハードルール・アーキテクチャ・開発コマンド → [`CLAUDE.md`](./CLAUDE.md)
- 領域別の詳細規約（対象ファイル編集時に参照）→ [`.claude/rules/`](./.claude/rules/)
- 再利用可能な手順 → [`.claude/skills/`](./.claude/skills/)

> 2026-06-12 の構成統合で、エージェント指示の SSoT を `CLAUDE.md` + `.claude/` に一本化しました（PR #522 で旧 AI ツール基盤と docs を削除 → PR #523 で `CLAUDE.md` / `.claude/rules/` / `.claude/skills/` / `.claude/settings.json` 一式を新規作成 → PR #552 で本 AGENTS.md を Codex 等のエントリポイントとして復元）。本ファイルは Codex 等が AGENTS.md を要求するためのエントリポイントであり、内容は持たず `CLAUDE.md` を参照します。
