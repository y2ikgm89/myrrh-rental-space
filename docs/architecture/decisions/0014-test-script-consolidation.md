# 14. Test script の整理とテスト実行ポリシーの明文化

- **Status**: Accepted
- **Date**: 2026-04-22
- **Deciders**: @y2ikgm89
- **Tags**: testing, tooling, ci, developer-experience
- **Supersedes (partial)**: [0010 per-directory test batch](./0010-per-directory-test-batch.md) の運用詳細を拡張
- **References**:
  - [Bun Test Docs — bail / coverage / test-name-pattern / watch](https://bun.sh/docs/test)
  - [Martin Fowler — The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
  - [lint-staged / husky best practices](https://builtin.com/articles/lint-staged-with-husky-pre-commit)

## Context and Problem Statement

ADR 0010 で per-directory batch 実行が採択された後も、`package.json` と関連 doc に以下の **冗長・矛盾した記述** が残存していた:

1. **`package.json` の `"test"` スクリプトが `"test:unit"` とほぼ同一内容**（unit 全バッチ + integration 一部のハードコピー）。`"test:all"` が既に正しい「unit + integration」定義を持つにもかかわらず 3 つ目の重複 script が存在
2. **`"test:watch"` が `bun test --watch`（引数なし）を呼ぶ**。Bun の watch モードは指定パスから再帰的にテストを走らせるため、ADR 0010 で禁止された「親ディレクトリ一括実行」と同等の `mock.module` 干渉を引き起こす
3. **`"test:coverage"` / `"test:coverage:check"` が coverage 計測を前提**。ADR 0010 で「per-directory batch では coverage 不正確」と明記済みで、実際 `.github/workflows/ci.yml` でも coverage ゲートは削除済み。`scripts/check-coverage.mjs` + 90% 閾値は **dead code**（誰も呼んでいない）
4. **`bunfig.toml` に `coverage = true` + `coverageThreshold = { line = 0.9, function = 0.9 }`** が残り、`bun test` 実行時に毎回 overhead を生み、かつ per-directory batch で lcov が上書きされて不正確
5. **CLAUDE.md の「検証」節に「テストをいつ走らせるか」のポリシーが未記載**。ユーザーから「毎回テスト実行すべきか」という問いが出る程度に暗黙知化していた
6. **多数の doc (`AGENTS.md`, `.claude/agents/verification.md`, `test-runner.md`, `.claude/rules/test-quality.md`, `CONTRIBUTING.md`, `docs/guides/testing.md`)** が削除済み / 非推奨の `bun run test` を指示し続けていた

## Decision Drivers

- **公式ベストプラクティス準拠**: Bun 公式 CLI フラグ (`--bail` / `--test-name-pattern` / `--watch <file>`) を活用。Jest 固有の `--findRelatedTests` 非搭載を前提とする
- **業界標準準拠**: pre-commit は高速な lint/format のみ、フルテストは CI + pre-push に委任（Martin Fowler / lint-staged コミュニティ共通）
- **ADR 0010 との整合**: `mock.module` 干渉を前提に、親ディレクトリ指定・watch・coverage を運用から排除
- **後方互換性なしのクリーン実装**: 冗長・dead code は削除。ユーザー明示指示
- **開発者体験**: 「毎回全テスト走らせなくてよい」を明文化してコミット前の摩擦を減らす

## Considered Options

### Option A: ドキュメントだけ整備（script は現状維持）

- ✅ 非破壊的
- ❌ dead code / 矛盾した script が残り、新規コントリビューターが混乱
- ❌ `bunfig.toml` の coverage 設定が毎 `bun test` で overhead を生む

### Option B: script を整理し、ポリシーを明文化（本 ADR の採択案）

- ✅ package.json / bunfig.toml が SSoT として正確
- ✅ CLAUDE.md に「テスト実行ポリシー」節を追加、暗黙知を解消
- ✅ ADR 0010 の運用詳細を具体化（「親ディレクトリ指定禁止」「`--watch <file>` のみ許可」等）
- ⚠️ `bun run test` / `test:watch` / `test:coverage` / `test:coverage:check` を使用していた外部 doc / CI / 個人 workflow は動かなくなる（後方互換性なし — ユーザー明示指示）

### Option C: 完全削除 + 新 runner 自作

- ❌ スコープ過大
- ❌ Bun 公式の test runner を捨てる正当性なし

## Decision Outcome

**Chosen option**: "Option B — script 整理 + ポリシー明文化"

### 削除するもの

| 対象                                   | 理由                                                                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` `"test"`                | `"test:unit"` の巨大チェーンをハードコピーしているだけ。`test:all` が正しい「unit + integration」                                                                                              |
| `package.json` `"test:watch"`          | `bun test --watch`（引数なし）は再帰実行で `mock.module` 干渉を引き起こす（ADR 0010 違反）。代替: `bun test --watch <single-file>` を直接使う                                                  |
| `package.json` `"test:coverage"`       | per-directory batch では lcov が上書きされ不正確。必要時は `bun test --coverage <file>` 単発で参考値を取る                                                                                     |
| `package.json` `"test:coverage:check"` | 90% 閾値ゲートが信頼できない coverage 値を採点する dead code（CI からも lefthook からも未参照）                                                                                                |
| `scripts/check-coverage.mjs`           | `test:coverage:check` の実装。共に撤去                                                                                                                                                         |
| `bunfig.toml` §coverage                | `coverage = true` / `coverageThreshold` / `coverageReporter` / `coverageDir` / `coverageSkipTestFiles` / `coverageIgnoreSourcemaps` / `coveragePathIgnorePatterns` を全削除（ADR 0010 と矛盾） |

### 残すもの（正規入口）

| script             | 用途                                                          |
| ------------------ | ------------------------------------------------------------- |
| `test:unit`        | per-directory batch（unit）。CI・手動フル実行・Cloud Build 用 |
| `test:integration` | per-directory batch（integration）。CI 用                     |
| `test:all`         | `test:unit && test:integration`。手動フル実行                 |
| `e2e` / `e2e:ui`   | Playwright                                                    |

開発時の日常運用は **`bun test <file>`** を中心に、`--watch <file>` / `--bail=1` / `--test-name-pattern` / `--coverage <file>` を必要に応じて付ける。

### テスト実行ポリシー（`CLAUDE.md` §検証 に追記）

| フェーズ     | 責務                            | 実行内容                                                               |
| ------------ | ------------------------------- | ---------------------------------------------------------------------- |
| 開発中       | 開発者（手動）                  | 関連 1 ファイル `bun test <path>` / `--watch <path>`                   |
| コミット直前 | `lefthook` pre-commit           | eslint-fix + prettier-fix + protected-files（staged のみ、テストなし） |
| push 直前    | `lefthook` pre-push             | `type-check` + `architecture-boundaries.test.ts` のみ                  |
| PR / push    | CI (`.github/workflows/ci.yml`) | `test:unit` + `test:integration` + E2E + lighthouse + bundle analysis  |
| リリース前   | 手動                            | 必要時のみ `bun run test:all`                                          |

**毎回のコミット前・完了前に全テストを走らせる必要はない**（これを明文化するのが本 ADR の主目的のひとつ）。

### Consequences

**良い点**:

- `package.json` の scripts が 11 → 7 に削減。dead code 撤去でメンテナンス負荷減
- `bunfig.toml` が 27 行 → 18 行、`bun test` 毎回の coverage overhead 除去
- 「毎回テスト必要？」という問いが CLAUDE.md で一発回答できる
- ADR 0010 の運用境界が具体化（親ディレクトリ指定・watch 再帰・coverage バッチが全て「禁止」として言語化）

**悪い点 / トレードオフ**:

- 外部で `bun run test` / `bun run test:watch` / `bun run test:coverage` / `bun run test:coverage:check` を叩いていたスクリプトは壊れる（後方互換性なし — ユーザー明示指示）
- `docs/guides/testing.md`（1623 行 → 20 行）の全面 redirect 化を同一 PR で完了済み（Follow-up ①達成）
- coverage を CI で強制したい場合のゲートは消える（ADR 0010 の制約で元々機能していなかったが、名目上のゲートを失う）

### Compliance / Validation

- `package.json` scripts が `validate / test:unit / test:integration / test:all / e2e / e2e:ui / dev / build / lint / lhci / analyze / db:*` 等に整理されている
- `bunfig.toml` に `coverage` 関連キーが存在しない
- `scripts/check-coverage.mjs` が存在しない
- `CLAUDE.md` §検証 に「テスト実行ポリシー（ADR 0014）」項が存在
- `AGENTS.md` / `CONTRIBUTING.md` が `bun run test`（単独）を指示していない
- subagents: `.claude/agents/verification.md` / `test-runner.md` / `test-writer.md` が削除済み script を指示していない（`e2e-test-writer.md` は Playwright 専門のため影響なし）
- rules: `.claude/rules/test-quality.md` / `bun-patterns.md` / `gotchas.md` が ADR 0010/0011 に沿った記述になっている
- `docs/guides/testing.md` 先頭に DEPRECATED notice
- プロジェクト全域 grep（`bun run test\b(?!:)|test:watch|test:coverage|coverageThreshold|check-coverage\.mjs`）で 0 hit

### 2026-04-22 追加クリーンアップ

本 ADR 採択時の `package.json` 変更が不完全で、Follow-up 実行時に `test` / `test:watch` / `test:coverage` / `test:coverage:check` 4 scripts が `package.json` に残存していたことが判明（Compliance / Validation の上記 `0 hit` 主張は当時の ADR 本体のみを対象とし、`package.json` scripts 本体の grep は未実施だった）。email SSoT test plan（当時 `docs/plans/2026-04-22-email-ssot-tests.md`、ADR-0015 clean-break により削除済み → `git log --all --diff-filter=D -- docs/plans/2026-04-22-email-ssot-tests.md`）実装時に「クリーン実装 + 後方互換性なし」指示に従って該当 4 scripts を削除。以後の grep（`"test":|"test:watch":|"test:coverage":|"test:coverage:check":"` against package.json）で 0 hit を確認。

## Follow-ups

- [x] `docs/guides/testing.md`（1623 行）の全面刷新 → 20 行の redirect に圧縮（本 PR で達成）。同時に `type-safety.md` / `prisma.md` / `nuqs.md` / `turbopack.md` / `coding-standards.md` も redirect 化
- [x] **`package.json` 残存 dead scripts（`test` / `test:watch` / `test:coverage` / `test:coverage:check`）の削除**（2026-04-22 完了）
- [ ] 次回依存更新時に `bun run validate` + CI green を確認し、削除した scripts への依存が外部 CI（GCP 以外）に残っていないか最終確認
- [x] `docs/requirements/` 全体を削除（stale な要件定義で実装が SoT のため）。`coding-standards.md` への誤リンク問題も同時解消（2026-04-23 完了）
