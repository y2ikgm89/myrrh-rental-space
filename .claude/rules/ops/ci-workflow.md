---
description: GitHub Actions CI ワークフローの SSoT 規律（Node heap / bun-version SSoT / concurrency / Required vs Opt-in / CodeQL Default setup / clientEnv 全 job 配布 / runner lost communication / billing / gh CLI debug pattern）
paths:
  - .github/workflows/**
  - package.json
  - scripts/run-tests.mjs
---

# GitHub Actions CI ワークフローパターン

> Stripe / Vercel / Linear / Shopify 等の業界標準パターン準拠。
> 過去 30 run 連続 failure の根本原因分析から確立した SSoT 規律（2026-05-13）。

## 1. workflow-global `env` + Node heap headroom（必須）

GitHub-hosted runner (`ubuntu-latest`) は 16 GB RAM 確保されているが、Node デフォルト heap は **~2 GB**。`tsc --noEmit --incremental false`（プロジェクト全体型チェック）と `next build` の TypeScript フェーズで **OOM (exit 134)** が発生する。`workflow-global env` で `NODE_OPTIONS` を明示的に拡張する:

```yaml
env:
  # GitHub-hosted ubuntu-latest は 16 GB RAM 保有だが Node デフォルト heap が
  # ~2 GB のため tsc / next build (TypeScript phase) で OOM 多発。
  # 4 GB 割当はゆとりがあり cold start にも影響しない。
  NODE_OPTIONS: "--max-old-space-size=4096"
```

**禁止**:

- per-step に `NODE_OPTIONS` を散在させる（drift の温床、global で一括）
- 6144 / 8192 等の不必要に大きい値（過剰 heap は GC pause を悪化）

## 2. `bun-version` SSoT（`package.json#packageManager` で一元管理）

`bun-version: "1.3.x"` の hardcode は **drift の温床**。`setup-bun@v2` 公式機能で `package.json#packageManager` を読み取る:

```yaml
# NG: hardcode（9+ 箇所で drift する）
- uses: oven-sh/setup-bun@v2
  with:
    bun-version: "1.3.13"

# OK: package.json#packageManager (bun@X.Y.Z) を SSoT
- uses: oven-sh/setup-bun@v2
  with:
    bun-version-file: package.json
```

**監査 grep**:

```bash
grep -rnE 'bun-version:' .github/workflows/
# → bun-version-file: package.json のみが正、bun-version: "X.Y.Z" は drift
```

## 3. `concurrency` で旧 run を cancel

feature branch / PR の連続 push で旧 run が queue を占拠する問題を防ぐ。**main / develop では履歴保持のため無効化**:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' && github.ref != 'refs/heads/develop' }}
```

## 4. Required vs Opt-in job 分離（業界標準パターン）

毎 push で重い test job を実行すると runner minute 浪費 + maintenance 負債が蓄積する。Stripe / Vercel / Linear / Shopify 公式 CI と同じ **"fast PR feedback + heavy jobs on demand"** pattern を採用:

| 分類                               | Job                               | trigger                                          |
| ---------------------------------- | --------------------------------- | ------------------------------------------------ |
| **Required** (毎 push 実行)        | `dependency-audit` (bun audit)    | push + PR                                        |
|                                    | `lint-and-typecheck`              | push + PR                                        |
|                                    | `unit-tests` (per-file isolation) | push + PR                                        |
|                                    | `build` (env validation)          | push (main/develop) + PR                         |
|                                    | `bundle-analysis` (Turbopack)     | push (main/develop) + PR                         |
| **Opt-in** (label / dispatch のみ) | `e2e-tests`                       | PR `e2e` label / workflow_dispatch               |
|                                    | `visual-regression`               | PR `visual-regression` label / workflow_dispatch |
|                                    | `lighthouse-ci`                   | PR `lighthouse` label / workflow_dispatch        |
| **PR comment only**                | `bundle-size-diff`                | PR のみ                                          |
| **main only**                      | `docs` (typedoc)                  | main push                                        |

**Opt-in 条件式 canonical**:

```yaml
e2e-tests:
  if: |
    (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'e2e')) ||
    github.event_name == 'workflow_dispatch'
```

**禁止**: 重い job を main push で auto-run する設計（baseline 自動再生成は破壊的変更時に baseline を silent 上書きする risk）。Visual Regression の baseline regeneration は **明示的な `workflow_dispatch` + `run_visual=true`** のみ。

## 5. CodeQL は Default setup に統一（Advanced workflow 不要）

`.github/workflows/codeql.yml` を手動メンテする Advanced setup は GitHub が runner / query 更新を自動追従しない上、private repo + 個人アカウントでは Code scanning settings 未有効化で「`Code scanning is not enabled for this repository`」エラーで毎 push fail する。

**正規ルート**: Repo Settings → Security → Code security and analysis → Code scanning → **Set up → Default** で Enable。

- public repo: 無料（GitHub Advanced Security 不要）
- private repo + 個人アカウント: 無料（2023〜）
- Languages 自動検出、query suite `default`（OWASP Top 10 含む標準セット）
- workflow file 不要、GitHub が runner / query を自動メンテ

**禁止**: `.github/workflows/codeql.yml` を再追加（custom query が必要なときのみ Advanced setup、現プロジェクトには該当機能なし）。

## 6. Test job は per-file isolation 必須

bun:test の `mock.module()` は **live binding を残す**公式仕様のため、複数 \*.test.ts を同一 `bun test` 起動で実行すると干渉する（[Bun docs](https://bun.com/docs/test/mocks)）。`bun run test:unit` / `test:integration` は per-file isolation runner（`scripts/run-tests.mjs`）経由必須:

```yaml
- name: Run unit tests (per-file isolation)
  run: bun run test:unit

- name: Run integration tests (per-file isolation)
  run: bun run test:integration
```

詳細は `.claude/rules/bun-patterns/test-runner.md` §per-file isolation runner を参照。

**禁止**:

- workflow から `bun test __tests__/unit` の直接実行（再帰実行 + mock 干渉）
- per-directory `&&` チェーンへの戻り（公式 SSoT は per-file isolation）

## 7. clientEnv は workflow-global `env` で全 job 配布

`@t3-oss/env-nextjs` の `clientEnv`（`NEXT_PUBLIC_*`）は `z.string().url()` 等の strict validation を runtime 起動時にも実行する。E2E / Visual / Lighthouse の Playwright `webServer` が `next start` を起動する際に env が欠落すると `Invalid environment variables` で webServer タイムアウト (120s) → job fail:

```yaml
env:
  # clientEnv (@t3-oss/env-nextjs) の z.string().url() を満たすため両 URL を渡す。
  # Playwright webServer が `next start` 起動時に NEXT_PUBLIC_BASE_URL 未設定だと
  # webServer タイムアウトで job fail する silent bug
  NEXT_PUBLIC_BASE_URL: http://localhost:3000
  NEXT_PUBLIC_APP_URL: http://localhost:3000
```

**禁止**: build job のみで env を設定（E2E / Visual / Lighthouse の webServer 起動で再 fail）。env は全 job で共有される workflow-global に置く。

## 8. デバッグパターン（gh CLI）

### per-job conclusion 一覧（最優先）

```bash
gh run view <run-id> --json jobs --jq '[.jobs[] | {name, conclusion}]'
# 失敗 job のみ:
gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion=="failure") | .databaseId'
```

### 失敗 step の log

```bash
gh run view --job <job-id> --log-failed 2>&1 | tail -100
```

### postgres ログのノイズで失敗が見えない

CI で postgres service container を使う job では、stdout が `FATAL: role "root" does not exist` のヘルスチェック probe ノイズで埋まる。本当の失敗 step を絞り込む:

```bash
gh run view --log --job <job-id> 2>&1 \
  | grep -E "Run E2E tests|FAIL|Error:|✘|failed|timeout" | head -50
```

### "runner lost communication with the server"

```
The hosted runner lost communication with the server. Anything in your workflow
that terminates the runner process, starves it for CPU/Memory, or blocks its
network access can cause this error.
```

これは **runner の異常終了**を意味し、原因は以下のいずれか:

| 原因             | 検出 / 対処                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| test の無限 hang | `gh run view <id>` で `Run E2E tests in 1h+` 等の異常長時間を確認。Playwright config の `timeout` / retries 設定を見直し、または job を opt-in 化 |
| OOM              | step log に `JavaScript heap out of memory` / `Aborted (core dumped)` / exit 134 が出る。`NODE_OPTIONS=--max-old-space-size=4096` で対処          |
| network 枯渇     | external API 呼び出しが多い test、または Playwright trace 巨大化。services の network options を見直す                                            |

### 部分 retry（billing 起因の skip 後）

```bash
gh run rerun <run-id> --failed  # 失敗 job のみを再実行（success / skipped は触らない）
```

## 9. Billing（Actions minutes）

GitHub Actions の minute 消費は **repo visibility で挙動が変わる**:

| visibility              | Actions minutes                | 推奨                   |
| ----------------------- | ------------------------------ | ---------------------- |
| **public**              | **無制限**                     | OSS / 学習プロジェクト |
| **private (Free tier)** | 2,000 min/月                   | 個人プロジェクト初期   |
| **private (Pro)**       | 3,000 min/月                   | $4/月、個人 paid       |
| **private (Team)**      | 3,000 min/月 + $0.008/min over | 組織                   |

private + Free tier で minute を使い切ると **job が "not started" で skip される**（"recent account payments have failed or your spending limit needs to be increased"）。判別:

```bash
gh run view <run-id> 2>&1 | grep "spending limit\|payments have failed"
```

**対処の選択肢**:

- public repo 化（最も clean、CodeQL も無料化のおまけ付き）
- Pro plan アップグレード（$4/月）
- 次月の minute reset を待つ
- spending limit を上げる（Settings → Billing → Spending limit）

**禁止**: minute 枯渇を `continue-on-error: true` で隠す（fail の根本原因が見えなくなる）。

## 10. Required check の同期（branch protection）

Required (毎 push 実行) job が完走するように pass-rate を確保した上で、GitHub Settings → Branches → Protection rules で **"Require status checks to pass before merging"** に以下を登録:

- `Dependency Audit (bun audit)`
- `Lint & Type Check`
- `Unit Tests`
- `Build (env validation)`
- `Bundle Analysis (Turbopack)`

opt-in job（E2E / Visual / Lighthouse）を required にすると、label を付け忘れた PR が永遠に merge できない silent UX bug になるため **required 登録禁止**。

## 11. Actions deprecation 警告は warn のみで放置可

GitHub-hosted runner の Node.js 20 deprecation 警告（2026-06 強制 Node 24 化、2026-09 Node 20 削除）:

```
Node.js 20 actions are deprecated. The following actions are running on Node.js 20
and may not work as expected: actions/checkout@v4, actions/upload-artifact@v4.
```

`actions/checkout@v4` / `actions/upload-artifact@v4` は upstream で Node 24 対応版が出るまで warn のまま運用する。`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` を env に追加する選択もあるが、互換性確認が必要なため自動 opt-in は推奨しない。

## 12. 監査 grep（ワークフロー一括検査）

```bash
# bun-version hardcode 残存確認（ゼロが正常）
grep -rnE 'bun-version: "' .github/workflows/

# NODE_OPTIONS heap 設定確認（workflow-global env にあるか）
grep -rn 'NODE_OPTIONS.*max-old-space-size' .github/workflows/

# CodeQL workflow が削除されているか確認
ls .github/workflows/codeql.yml 2>/dev/null && echo "DRIFT: codeql.yml exists, Default setup と二重化"

# Opt-in label trigger pattern の整合性
grep -rnE "contains\(github\.event\.pull_request\.labels\.\*\.name" .github/workflows/

# NEXT_PUBLIC_BASE_URL が workflow-global env にあるか
grep -n 'NEXT_PUBLIC_BASE_URL' .github/workflows/ci.yml | head -3
```

## 13. 参考

- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) — `bun-version-file` 公式機能
- [Bun test mocks](https://bun.com/docs/test/mocks) — `mock.module()` live binding 仕様
- [GitHub Actions concurrency](https://docs.github.com/en/actions/using-jobs/using-concurrency)
- [CodeQL Default setup](https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning)
- [Stripe Engineering Blog — CI](https://stripe.com/blog) / [Vercel — fast feedback CI](https://vercel.com/blog) — opt-in label pattern の業界 reference
- [@t3-oss/env-nextjs](https://env.t3.gg/) — runtime / build env validation 設計
- `.claude/rules/bun-patterns/test-runner.md` §per-file isolation
- `.claude/rules/bun-patterns/mocking.md` §mock.module live binding
- `.claude/rules/test-quality/unit-bun.md` §fixture drift 検出
