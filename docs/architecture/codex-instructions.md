# Codex Instruction Architecture

最終更新: 2026-04-24

## 目的

OpenAI Codex 公式ドキュメントに合わせ、Codex 向け instruction assets を `AGENTS.md`, `.agents/skills`, `.codex/agents`, `.codex/rules`, `.codex/hooks.json` に集約する。

このリポジトリでは後方互換の Codex mirror を持たない。`.claude/*` は残置するが、Codex 作業では参照・同期・正本扱いしない。

## 公式仕様との対応

| Codex 公式概念 | このリポジトリでの配置           | 方針                                                           |
| -------------- | -------------------------------- | -------------------------------------------------------------- |
| AGENTS.md      | `AGENTS.md`                      | 常時読むプロジェクト指示。短く、全体制約に絞る                 |
| Skills         | `.agents/skills/<name>/SKILL.md` | 再利用する作業手順。frontmatter は `name` / `description` のみ |
| Subagents      | `.codex/agents/*.toml`           | 明示依頼時だけ使う狭い専門ロール                               |
| Rules          | `.codex/rules/default.rules`     | sandbox 外コマンド承認の `prefix_rule`。coding rules ではない  |
| Hooks          | `.codex/hooks.json`              | Windows では公式上無効。現時点では未採用。空設定で維持         |
| Codex app      | `.codex/config.toml`             | app / CLI で共有する subagent 上限だけ設定                     |

## Official Alignment Notes

- `AGENTS.md` は Codex 起動時にグローバルから作業ディレクトリまで階層的に連結されるため、このリポジトリではルートに恒久的なプロジェクト制約だけを置く。
- skills は `name` / `description` metadata で候補化され、必要時だけ `SKILL.md` 本文が読まれるため、description に発火条件と非発火条件を明記する。
- custom agents は `.codex/agents/*.toml` に 1 ファイル 1 agent で置き、`name` / `description` / `developer_instructions` を必須にする。`model` は必要な場合だけ固定し、通常は親セッションから継承する。
- rules は experimental な command approval policy として扱い、`prefix_rule` の `pattern` / `decision` / `justification` で方針を表し、`match` / `not_match` を小さな仕様テストとして維持する。
- hooks は experimental かつ Windows support が一時無効なので、Windows 開発が主環境のこのリポジトリでは有効化しない。

## Local Tooling Notes

- Windows ではユーザー領域の `C:\Users\y2ikg\.local\bin\rg.exe` を `rg` の正本として扱う。
- Codex Desktop 同梱の `WindowsApps\OpenAI.Codex_...\app\resources\rg.exe` は外部 PowerShell から直接起動できない場合がある。WindowsApps の所有権 / ACL は変更せず、通常版 ripgrep を PATH で優先する。
- `rules` にはこの情報を書かない。`.codex/rules/*.rules` は sandbox 外コマンド承認だけに使う。

## Repository Skills

| Skill                           | 用途                                    |
| ------------------------------- | --------------------------------------- |
| `admin-clean-break`             | 管理画面、Server Actions、mutation 変更 |
| `admin-ui-review`               | 管理画面 UI、共有 chrome、z-index、導線 |
| `auth-rbac-change`              | Better Auth、RBAC、admin gate、監査     |
| `freeform-page-builder`         | custom page freeform builder            |
| `lexical-editor`                | 管理画面 Lexical editor                 |
| `media-storage-change`          | media domain、R2/S3、media picker       |
| `prisma-data-change`            | Prisma schema、migration、seed、DB 境界 |
| `public-site-change`            | 公開 route、公開 UI、SEO、公開 form     |
| `project-validation`            | 完了前、PR 前、release 前の検証         |
| `codex-instruction-maintenance` | Codex ネイティブ資産の保守              |

## Custom Agents

| Agent                   | 用途                                                        | Sandbox         |
| ----------------------- | ----------------------------------------------------------- | --------------- |
| `codebase_explorer`     | 実装前の read-only コードパス調査                           | read-only       |
| `admin_ui_reviewer`     | 管理画面 UI、共有 chrome、レイヤー、アクセシビリティ確認    | read-only       |
| `docs_researcher`       | OpenAI / Next.js / React / Prisma など一次情報の確認        | read-only       |
| `page_builder_reviewer` | freeform builder 変更の設計 / UX / renderer purity レビュー | read-only       |
| `test_verifier`         | 対象テストや validate の実行と結果要約                      | workspace-write |

Codex は subagent を明示依頼なしに spawn しない。通常作業ではメイン agent が実装し、ユーザーが「subagent を使って」「並列で調査して」などと依頼した場合だけ使う。

## Clean-Break Decisions

- `docs/reference/codex-rules/*` は削除する。Codex rules は `.codex/rules/*.rules` の command approval だけに使う。
- `.claude/*` と Codex 資産の同期スクリプト、同期 CI job、package scripts は削除する。
- Codex 用の新規ワークフローは `.agents/skills` に追加する。
- Codex 用の専門 agent は `.codex/agents` に追加する。
- `.codex/agents` のファイル名は agent `name` と一致させる。
- `admin-ui-review` と `admin_ui_reviewer` は、管理画面全体レビューで見つかった z-index / 別タブリンク / 共有 UI primitives の再発防止用に追加する。

## 更新ルール

- 新しい recurring workflow は `.agents/skills/<name>/SKILL.md` に追加する。
- 1 skill は 1 workflow に限定する。
- SKILL.md の frontmatter は `name` と `description` のみ。
- 新しい custom agent は「明示依頼で使う価値がある狭い職能」に限定する。
- `.codex/rules` に coding rule を置かない。
- hooks を使いたい場合は、現在の OpenAI Codex hooks ドキュメントで Windows support と対象 event の対応状況を確認してから再設計する。

## 参照した公式ドキュメント

- [Codex app](https://developers.openai.com/codex/app)
- [Agent Skills](https://developers.openai.com/codex/skills)
- [Subagents](https://developers.openai.com/codex/subagents)
- [Rules](https://developers.openai.com/codex/rules)
- [Hooks](https://developers.openai.com/codex/hooks)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
