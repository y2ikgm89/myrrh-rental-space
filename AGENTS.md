# AGENTS.md

このリポジトリの **AI エージェント向け指示の正本（SSoT）は [`CLAUDE.md`](./CLAUDE.md)** です。

OpenAI Codex など [agents.md](https://agents.md) 互換ツールは本 `AGENTS.md` をエントリポイントとして読み込みますが、規約の重複（drift）を避けるためルールは複製しません。**作業前に必ず [`CLAUDE.md`](./CLAUDE.md) を読み、その指示に従ってください。**

- ハードルール・アーキテクチャ・開発コマンド → [`CLAUDE.md`](./CLAUDE.md)
- 領域別の詳細規約（対象ファイル編集時に参照）→ [`.claude/rules/`](./.claude/rules/)
- 再利用可能な手順 → [`.claude/skills/`](./.claude/skills/)

> 2026-06-12 の構成統合で、エージェント指示の SSoT を `CLAUDE.md` + `.claude/` に一本化しました（PR #522 で旧 AI ツール基盤と docs を削除 → PR #523 で `CLAUDE.md` / `.claude/rules/` / `.claude/skills/` / `.claude/settings.json` 一式を新規作成 → PR #552 で本 AGENTS.md を Codex 等のエントリポイントとして復元）。本ファイルは Codex 等が AGENTS.md を要求するためのエントリポイントであり、内容は持たず `CLAUDE.md` を参照します。

## Learned User Preferences

- 破壊的変更を許容し、後方互換のための暫定フォールバックや曖昧な実装を残さず、公式推奨のクリーンな実装を優先する
- ライブラリ・フレームワークの設計判断は公式ドキュメントと Context7 で照合してから実装する
- 既存ドメインパターンと公式推奨が矛盾する場合は、公式推奨を優先する（posts/news 等への後追い整合は別途）
- 不明点や曖昧点を残したまま進めず、根本原因を特定してから修正する

## Learned Workspace Facts

- Lexical コンテンツ（posts/news/terms）では `contentJson` が正本、`contentHtml` は SSR・同意記録用の派生キャッシュ
- terms 永続化は server 側で `contentJson` → HTML 派生（`renderEditorStateJsonToHtmlServer`）→ command 層で sanitize。クライアントから `contentHtml` を送らない
- 既存規約の一括同期は `20260627120000_terms_lexical_content_sync`（legacy JSON 修復 + 全行 HTML 派生）
- terms 新規作成テンプレートは RSC で HTML → Lexical JSON import（`tryConvertHtmlStringToLexicalJsonServer`）し `initialTemplateJson` を渡す
- Lexical 由来 HTML の sanitize 許可属性は `lexical-html-sanitize-config.ts` を SSoT とし、sanitize-html 側は `data-*`/`aria-*` glob、DOMPurify 側は `ALLOW_DATA_ATTR`
