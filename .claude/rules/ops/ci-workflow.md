---
description: GitHub Actions CI ワークフローの SSoT 規律（Node heap / bun-version SSoT / concurrency / CodeQL / per-file isolation / clientEnv 配布 / Actions Node 24 / host-aware security headers）
paths:
  - .github/workflows/**
  - package.json
  - scripts/run-tests.ts
---

# GitHub Actions CI ワークフローパターン

> Stripe / Vercel / Linear / Shopify 等の業界標準パターン準拠。過去 30 run 連続 failure の根本原因分析から確立した SSoT 規律（2026-05-13）。

## Sub-rules

| Topic                                       | File                          |
| ------------------------------------------- | ----------------------------- |
| Required vs Opt-in + Branch Protection      | `ci-workflow/job-strategy.md` |
| Lighthouse / Playwright webServer / E2E env | `ci-workflow/testing-perf.md` |
| gh CLI debug / Billing / 監査 grep          | `ci-workflow/debug.md`        |

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

監査 grep: `grep -rnE 'bun-version:' .github/workflows/`（→ `bun-version-file: package.json` のみが正、`bun-version: "X.Y.Z"` は drift）。

## 3. `concurrency` で旧 run を cancel（event_name 込み）

feature branch / PR の連続 push で旧 run が queue を占拠する問題を防ぐ。**main では履歴保持のため無効化**（trunk-based development、develop ブランチは未使用）。`event_name` を group に含めないと、main で in-progress な workflow_dispatch run が main push trigger によって cancel される race condition が発生する:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}-${{ github.event_name }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

## 4. CodeQL は Default setup に統一（Advanced workflow 不要）

`.github/workflows/codeql.yml` を手動メンテする Advanced setup は GitHub が runner / query 更新を自動追従しない上、private repo + 個人アカウントでは Code scanning settings 未有効化で「`Code scanning is not enabled for this repository`」エラーで毎 push fail する。

**正規ルート**: Repo Settings → Security → Code security and analysis → Code scanning → **Set up → Default** で Enable。

- public repo: 無料（GitHub Advanced Security 不要）
- private repo + 個人アカウント: 無料（2023〜）
- Languages 自動検出、query suite `default`（OWASP Top 10 含む標準セット）
- workflow file 不要、GitHub が runner / query を自動メンテ

**禁止**: `.github/workflows/codeql.yml` を再追加（custom query が必要なときのみ Advanced setup、現プロジェクトには該当機能なし）。

## 5. Test job は per-file isolation 必須

bun:test の `mock.module()` は **live binding を残す**公式仕様のため、複数 `*.test.ts` を同一 `bun test` 起動で実行すると干渉する（[Bun docs](https://bun.com/docs/test/mocks)）。`bun run test:unit` / `test:integration` は per-file isolation runner（`scripts/run-tests.ts`）経由必須:

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

## 6. clientEnv は workflow-global `env` で全 job 配布

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

## 7. Actions は Node 24 対応版に統一（最新 major version）

GitHub-hosted runner の Node.js 20 deprecation（2026-06 強制 Node 24 化、2026-09 Node 20 削除）は **全 upstream actions が Node 24 対応 major version をリリース済**（2026-04 時点）。warn 放置ではなく **最新 major version に upgrade が canonical**:

| Action                             | 旧 (Node 20) | 新 (Node 24) | Breaking change                                                                |
| ---------------------------------- | ------------ | ------------ | ------------------------------------------------------------------------------ |
| `actions/checkout`                 | `@v4`        | **`@v6`**    | v6: persist-credentials を `$RUNNER_` 格納（runner v2.329.0+）                 |
| `actions/upload-artifact`          | `@v4`        | **`@v7`**    | v7: ESM 移行 + 任意 `archive: false` で direct upload                          |
| `actions/cache`                    | `@v4`        | **`@v5`**    | input 互換、runner v2.327.1+ 必須                                              |
| `actions/dependency-review-action` | `@v4`        | **未採用**   | Dependency Graph 機能依存 + bun audit と機能重複（§10 参照）                   |
| `actions/labeler`                  | `@v5`        | **`@v6`**    | input 互換（config 形式は v5 で確立、`changed-files-labels-limit` 新規 input） |
| `actions/stale`                    | `@v9`        | **`@v10`**   | input 互換、runner v2.327.1+ 必須                                              |
| `peter-evans/create-pull-request`  | `@v6`        | **`@v8`**    | input 互換、runner v2.327.1+ 必須                                              |
| `oven-sh/setup-bun`                | `@v2`        | `@v2` (現行) | major version 据置                                                             |
| `preactjs/compressed-size-action`  | `@v2`        | `@v2` (現行) | major version 据置                                                             |
| `rhysd/actionlint`                 | bash dl      | bash dl      | curl で latest を取得（version pin なし）                                      |

GitHub-hosted `ubuntu-latest` は常に最新 runner のため runner version 制約は自動充足。`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` 強制 opt-in は不要。

**Action 最新版の確認 SSoT**: `curl -s "https://api.github.com/repos/<owner>/<repo>/releases/latest" | jq -r .tag_name`。

**禁止**: deprecation warning を「warn のまま放置」する旧運用（upstream が既に Node 24 対応版をリリース済の状態では誤り）。

## 8. CI 専用 host-aware security headers（HSTS / CSP localhost skip）

localhost / 127.0.0.1 への接続で `Strict-Transport-Security` header と CSP `upgrade-insecure-requests` directive を **skip 必須**。これらは HTTPS 前提の directive で、HTTP-only な localhost に対して適用すると Chrome (Lighthouse / E2E Playwright) が HTTPS への redirect を強制 → certificate warning interstitial (`CHROME_INTERSTITIAL_ERROR`) → navigation が必ず fail する silent bug。

```typescript
// src/proxy.ts
function isLocalhostRequest(req: NextRequest): boolean {
  const host = req.headers.get("host") ?? "";
  return (
    host.startsWith("localhost:") ||
    host === "localhost" ||
    host.startsWith("127.0.0.1:") ||
    host === "127.0.0.1"
  );
}

function applySecurityHeaders(
  headers: Headers,
  csp: string,
  isLocalhost: boolean,
): void {
  for (const [key, value] of SECURITY_HEADERS) {
    if (key === "Strict-Transport-Security" && isLocalhost) continue;
    headers.set(key, value);
  }
  headers.set("Content-Security-Policy", csp);
}
```

参照実装: `src/proxy.ts` (commit `cb56bdbc`)。本番 hostname では従来通り HSTS + upgrade-insecure-requests を付与（HTTPS 強制で security 維持）。

## 9. `preactjs/compressed-size-action` は setup-bun 必須（PATH 漏れ silent bug）

`preactjs/compressed-size-action@v2` は **base / head の双方で `bun install --frozen-lockfile` を内部実行**する（`package.json#packageManager` を読み取って `bun` を選択）。job 定義に `oven-sh/setup-bun@v2` step が無いと `##[error]Unable to locate executable file: bun.` で必ず fail する。

```yaml
# OK: setup-bun を先に走らせて PATH に bun を通す
- uses: actions/checkout@v6
- uses: oven-sh/setup-bun@v2
  with:
    bun-version-file: package.json
- uses: preactjs/compressed-size-action@v2
  with:
    repo-token: ${{ secrets.GITHUB_TOKEN }}
    build-script: "build:skip-env"

# NG: bun が無い環境で compressed-size-action が install を試みて即 fail
- uses: actions/checkout@v6
- uses: preactjs/compressed-size-action@v2
```

`bundle-analysis` job が動くからと `bundle-size-diff` で setup-bun を省略するのは silent drift。両 job とも setup-bun を入れる。

## 10. `actions/dependency-review-action` は採用しない（bun audit + Dependency Graph 制約）

### 10.1. 採用しない理由（3 連 silent bug + 機能重複）

`actions/dependency-review-action@v5` は本プロジェクトでは **採用しない**。導入を試みた際に判明した silent bug は以下 3 連:

1. **Dependency Graph 機能依存** — `Dependency review is not supported on this repository. Please ensure that Dependency graph is enabled` で必ず fail。private repo + 個人アカウントでは default で無効、Settings → Security → Dependency graph を手動 Enable 必要。**runner / build とは別レイヤーの GitHub repo setting に依存** = workflow file だけでは self-contained に動かせない（reproducibility 損失）
2. **`allow-licenses` と `deny-licenses` は排他的** — `@v5` で破壊的変更：両方同時指定すると `You cannot specify both allow-licenses and deny-licenses` で fail
3. **license list は comma-separated 単一行のみ** — YAML literal block (`|`) は leading whitespace が SPDX 識別子に混入し `Invalid license(s) in <field>: MIT` で fail

これら 3 つを全て解消しても、**`bun audit --prod --severity=high`（ci.yml `dependency-audit` job）が全依存の脆弱性 scan を毎 PR 実行**しており機能重複。`Renovate` も auto-patch + 脆弱性即時更新で license 情報込みの PR を自動生成する。

### 10.2. 規律

- **`.github/workflows/dependency-review.yml` 再追加禁止** — 上記 3 連 silent bug + bun audit 重複のため
- **license violation の検知** — `Renovate` PR で license 情報を確認 + 人間 review で担保（AGPL/GPL 系 package を実プロジェクトで使うことは現実的にほぼない）
- **将来再評価する場合** — Dependency Graph を有効化済 + bun audit と異なる役割（PR diff 限定 review）が明確になったタイミングで導入検討。再導入時は §10.1 の 3 silent bug を全て解消した状態で 1 commit に集約
