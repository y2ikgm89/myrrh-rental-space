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

| 分類                               | Job                               | trigger                                                                                            |
| ---------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Required** (毎 push 実行)        | `dependency-audit` (bun audit)    | push + PR                                                                                          |
|                                    | `lint-and-typecheck`              | push + PR                                                                                          |
|                                    | `unit-tests` (per-file isolation) | push + PR                                                                                          |
|                                    | `build` (env validation)          | push (main/develop) + PR                                                                           |
|                                    | `bundle-analysis` (Turbopack)     | push (main/develop) + PR                                                                           |
| **Opt-in** (label / dispatch のみ) | `e2e-tests`                       | PR `e2e` label / `workflow_dispatch run_e2e=true`                                                  |
|                                    | `visual-regression`               | PR `visual-regression` label / `workflow_dispatch run_visual=true` / `update_visual_baseline=true` |
|                                    | `lighthouse-ci`                   | PR `lighthouse` label / `workflow_dispatch run_lighthouse=true`                                    |
| **PR comment only**                | `bundle-size-diff`                | PR のみ                                                                                            |
| **main only**                      | `docs` (typedoc)                  | main push                                                                                          |

**workflow_dispatch inputs SSoT**（`workflow_dispatch.inputs.*`）:

```yaml
workflow_dispatch:
  inputs:
    run_e2e: { type: boolean, default: false }
    run_visual: { type: boolean, default: false } # baseline 比較
    update_visual_baseline: { type: boolean, default: false } # baseline 再生成 + auto-PR
    run_lighthouse: { type: boolean, default: false }
```

**Opt-in 条件式 canonical**:

```yaml
e2e-tests:
  if: |
    (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'e2e')) ||
    (github.event_name == 'workflow_dispatch' && github.event.inputs.run_e2e == 'true')
```

**Visual baseline 再生成 SSoT**（CI Ubuntu runner と font rendering を一致させるため CI 上で生成が canonical、ローカル Windows / macOS 生成は CI で必ず diff 出る）:

1. `gh workflow run ci.yml --ref <branch> -f update_visual_baseline=true` で起動
2. CI が `bunx playwright test --project=chromium-visual --update-snapshots` を実行
3. 生成された `e2e/visual/**/*-snapshots/` を `peter-evans/create-pull-request@v6` が **別 branch (`ci/visual-baseline-<run_id>`) に push + 自動 PR 作成**
4. PR で required status checks (5 essential) を通過 → 人間レビュー → merge
5. baseline diff は PR の `Files changed` で binary diff としても確認可能

`permissions: { contents: write, pull-requests: write }` を当該 job に明示必要。

**禁止**:

- 重い job を main push で auto-run する設計（baseline 自動再生成は破壊的変更時に baseline を silent 上書きする risk）
- Visual baseline をローカルで生成して commit（CI と font rendering 不一致で必ず fail）
- `update_visual_baseline=true` の `workflow_dispatch` を main branch 以外で起動（auto-PR の base branch ミスマッチ）
- **main へ直接 push (`git push origin HEAD:${{ github.ref_name }}`) する旧パターン** — branch protection の required status checks (`GH006: protected branch hook declined`) で reject される。peter-evans/create-pull-request@v6 で PR 化必須
- branch protection の `bypass_actors` に `github-actions[bot]` を追加する迂回案（「bot は無検証」の運用リスク、PR ベースの方が clean）

**Visual baseline auto-PR pattern**（2026-05-13 commit `e09f5691` の branch protection 適用後に確立）:

```yaml
- name: Stage regenerated visual baseline
  if: github.event_name == 'workflow_dispatch' && github.event.inputs.update_visual_baseline == 'true' && success()
  id: stage-baseline
  shell: bash
  run: |
    shopt -s globstar nullglob
    baseline_dirs=(e2e/visual/**/*-snapshots/)
    if [ ${#baseline_dirs[@]} -eq 0 ]; then
      echo "has_changes=false" >> "$GITHUB_OUTPUT"; exit 0
    fi
    git add "${baseline_dirs[@]}"
    if git diff --cached --quiet; then
      echo "has_changes=false" >> "$GITHUB_OUTPUT"
    else
      echo "has_changes=true" >> "$GITHUB_OUTPUT"
    fi

- name: Create PR for regenerated baseline
  if: steps.stage-baseline.outputs.has_changes == 'true'
  uses: peter-evans/create-pull-request@v6
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    branch: ci/visual-baseline-${{ github.run_id }}
    base: ${{ github.ref_name }}
    commit-message: "ci(visual): regenerate visual baseline (run ${{ github.run_id }})"
    title: "ci(visual): regenerate visual baseline"
    body: |
      ## Visual baseline regeneration
      **Run**: #${{ github.run_id }} / **Actor**: @${{ github.actor }}
      Review checklist 込みの auto-generated PR
    labels: |
      visual-baseline
      automated
    delete-branch: true
```

**業界 reference**: Playwright 公式 docs / Chromatic (Storybook visual SaaS) / Percy (BrowserStack) は全て同 pattern。`peter-evans/create-pull-request@v6` は GitHub Marketplace verified action（typescript-eslint / shadcn-ui / Next.js 等で広く採用）。

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

**Branch Protection IaC 化（`gh api` SSoT 適用）**:

```bash
# 1. .github/branch-protection.json に required_status_checks + strict + restrictions を JSON 化
# 2. PUT で適用 (idempotent、再実行で同一状態に収束)
gh api repos/<owner>/<repo>/branches/main/protection \
  -X PUT --input .github/branch-protection.json
```

**規律**:

- `contexts:` の値は workflow `name:` と **完全一致** 必須（括弧・空白・記号含め literal match、`Dependency Audit (bun audit)` 等）。drift すると required が無効化（check 未受信扱い）し silent に PR が merge 可能になる
- 個人 repo は `enforce_admins: false`（緊急 hotfix で admin bypass を残す、組織 repo は別判断）
- 設定確認: `gh api repos/<owner>/<repo>/branches/main/protection 2>&1 | head -10` で **raw 出力** を確認（`gh: Branch not protected` 等の stderr が混入するため `python3 -c "import json,sys; json.load(sys.stdin)"` の前に必ず raw 確認）
- opt-in job（E2E / Visual / Lighthouse）を `contexts:` に含めない（label 付け忘れた PR が永遠に merge 不能になる silent UX bug）

実例: 2026-05-13 commit `e09f5691` で `.github/branch-protection.json` 配置 + 5 essential checks 登録（過去 30+ run failure → 完全 green 化セッションの締めくくり）。

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

## 14. CI 専用 host-aware security headers（HSTS / CSP localhost skip）

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

function buildCsp(
  nonce: string,
  pathname: string,
  isLocalhost: boolean,
): string {
  // ... directives ...
  // upgrade-insecure-requests は localhost で omit
  return `... ${isLocalhost ? "" : "upgrade-insecure-requests;"}`;
}
```

参照実装: `src/proxy.ts` (commit `cb56bdbc`)。本番 hostname では従来通り HSTS + upgrade-insecure-requests を付与（HTTPS 強制で security 維持）。

## 15. Lighthouse CI 起動 timeout SSoT

`.lighthouserc.json` で:

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "bun run lhci:start-server",
      "startServerReadyPattern": "(Ready in|started server)",
      "startServerReadyTimeout": 300000
    }
  }
}
```

- `startServerReadyTimeout: 120000` (default) では CI cold build + start が間に合わず、server 起動前に Lighthouse が navigate → `chrome-error://chromewebdata/` (connection refused) → CHROME_INTERSTITIAL_ERROR で fail
- **300000 (5 分)** が canonical（build ~60s + start ~10s + 余裕）
- `startServerReadyPattern` は **regex** で `(Ready in|started server)` — next dev (Turbopack) と next start (production) 両方の output に対応

`scripts/lhci-start.ts` が `bun run build:skip-env` + `bun x next start` を child spawn する設計。env fallback で `validateProductionEnv` の要求 env を埋める（ENCRYPTION*KEY / R2*\* / CRON_SECRET 等）。

## 16. Playwright webServer の CI / local 分岐 + E2E 用 opt-in env

```typescript
// playwright.config.ts
webServer: {
  command: process.env["CI"] ? "bun run start" : "bun run dev",
  url: "http://localhost:3000",
  reuseExistingServer: !process.env["CI"],
  timeout: 180 * 1000,
}
```

- ローカル: `bun run dev` (Turbopack HMR、開発と同等の環境で spec を反復実行)
- CI: `bun run start` (production build artifact を起動。dev mode の Turbopack initial compile による spec timeout / runner CPU 枯渇を回避)
- timeout: 180s (production build cold start + dependencies init 込み)

**dev mode を CI で使うと runner lost communication になる**（過去 30+ run 連続 failure の主因）— Turbopack initial compile × 大量 spec `page.goto()` 並行で資源枯渇。

### `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` opt-in pattern

production build でも `DevLoginButton` を表示するため `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` を build + runtime 両方に伝播:

```yaml
# .github/workflows/ci.yml (E2E job)
- name: Build application
  run: bun run build:skip-env
  env:
    NEXT_PUBLIC_ENABLE_E2E_LOGIN: "1"
    SKIP_ENV_VALIDATION: "true"

- name: Run E2E tests
  run: bunx playwright test
  env:
    CI: true
    NEXT_PUBLIC_ENABLE_E2E_LOGIN: "1"
    # production build を `next start` で動かすため validateProductionEnv の要求 env を埋める
    ENCRYPTION_KEY: "..."
    R2_*: "..."
```

```tsx
// page.tsx の DevLoginButton render gate
{
  (process.env["NODE_ENV"] !== "production" ||
    process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"] === "1") && <DevLoginButton />;
}
```

**禁止**: `NEXT_PUBLIC_ENABLE_E2E_LOGIN` を staging / production に伝播（login bypass risk）。CI workflow に閉じた opt-in。

## 17. workflow_dispatch ↔ push 独立 concurrency group

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}-${{ github.event_name }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' && github.ref != 'refs/heads/develop' }}
```

`event_name` を group に含めないと、main で in-progress な workflow_dispatch run が main push trigger によって cancel される race condition が発生する（実例: run 25784115856 / 25784189083 が pending 中に cancel）。

## 18. bash glob 展開規律（Actions step 内）

GitHub Actions の default shell `bash --noprofile --norc -eo pipefail {0}` は **globstar OFF**。`'e2e/**/*-snapshots/'` のような `**` glob は **literal 解釈**されて silent fail する:

```yaml
# NG: git add 'e2e/**/*-snapshots/' || true
#     ↓ ** literal で展開されず、`git diff --cached --quiet` が true → commit skip
# OK: shopt -s globstar nullglob で明示展開
- name: Commit baseline
  shell: bash
  run: |
    shopt -s globstar nullglob
    baseline_dirs=(e2e/visual/**/*-snapshots/)
    if [ ${#baseline_dirs[@]} -eq 0 ]; then exit 0; fi
    git add "${baseline_dirs[@]}"
```

`nullglob` で配列が空になっても fail しない。

## 19. gh CLI: job 単体 log を run 完了前に取得

```bash
# NG: run 全体完了まで block する（30+ 分待ち）
gh run view --log-failed --job <job-id>

# OK: gh api 直叩きで job 完了即 fetch 可能
gh api repos/<owner>/<repo>/actions/jobs/<job-id>/logs
```

run 内の 1 job だけ早期 debug したい時の canonical（例: E2E in_progress 中に Lighthouse fail の log を見たい）。

## 20. Lighthouse audit detail を run 完了前に取得

`temporary-public-storage` upload URL を経由して run 全体完了を待たず audit detail を抽出可能（`gh run view --log-failed --job` は run 全体完了まで block する制約を回避）:

```bash
# 1. job 単体 log から report URL を取得 (job 完了後すぐ)
gh api repos/<owner>/<repo>/actions/jobs/<job-id>/logs | grep "Open the report"
# → https://storage.googleapis.com/lighthouse-infrastructure.appspot.com/reports/...

# 2. JSON 抽出 + a11y audit detail 解析
curl -s <report-url> | python3 -c "
import sys, re, json
html = sys.stdin.read()
m = re.search(r'window\.__LIGHTHOUSE_JSON__ = ({.*?});', html, re.DOTALL)
d = json.loads(m.group(1))
print(f'a11y={d[\"categories\"][\"accessibility\"][\"score\"]}')
a11y_ids = {a['id'] for a in d['categories']['accessibility']['auditRefs']}
for aid, audit in d['audits'].items():
  if aid in a11y_ids and audit.get('score') is not None and audit['score'] < 1:
    for item in audit.get('details', {}).get('items', [])[:3]:
      print(f\"{aid}: {item.get('node', {}).get('selector', '')[:100]}\")
"
```

failing audit の `selector` / `snippet` / `explanation` を取得して production code 側で fix する canonical workflow。実例: 2026-05-13 a11y root-cause fix で全 5 公開 page の audit detail を CI run 完了前に取得 → production code 修正 → 完全 green 達成。

## 21. 参考

- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) — `bun-version-file` 公式機能
- [Bun test mocks](https://bun.com/docs/test/mocks) — `mock.module()` live binding 仕様
- [GitHub Actions concurrency](https://docs.github.com/en/actions/using-jobs/using-concurrency)
- [CodeQL Default setup](https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning)
- [Stripe Engineering Blog — CI](https://stripe.com/blog) / [Vercel — fast feedback CI](https://vercel.com/blog) — opt-in label pattern の業界 reference
- [@t3-oss/env-nextjs](https://env.t3.gg/) — runtime / build env validation 設計
- `.claude/rules/bun-patterns/test-runner.md` §per-file isolation
- `.claude/rules/bun-patterns/mocking.md` §mock.module live binding
- `.claude/rules/test-quality/unit-bun.md` §fixture drift 検出
