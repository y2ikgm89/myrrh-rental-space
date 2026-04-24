# nuqs ガイド

> Codex では `CLAUDE.md` / `.claude/*` を追跡しない。nuqs 変更は近接コードと Codex 正本から判断する。

## Codex 正本

| 対象                                                                         | Codex で読む場所                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| nuqs 2.x 実装パターン / パーサーマップ / `shallow: false` / `useQueryStates` | `src/shared/lib/nuqs/*` と既存利用箇所                           |
| パーサー SSoT（`@/shared/lib/nuqs`）                                         | `src/shared/lib/nuqs/*`                                          |
| URL 由来初期値の remount（`key={urlValue}`）                                 | 既存 React component の近接実装と [`AGENTS.md`](../../AGENTS.md) |
| フィルター UI 閾値（pill / scroll / dropdown）                               | 既存 UI 実装と対象 skill                                         |

## Claude Code Legacy

`.claude/rules/nuqs-patterns.md` は Claude Code 用に残置する。Codex 作業では参照しない。

## 補足

- 使用バージョンの SSoT は `package.json` + `bun.lock`
