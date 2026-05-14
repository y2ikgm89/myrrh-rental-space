---
description: GitHub Actions の Required vs Opt-in job 戦略と Branch Protection IaC（業界標準 "fast PR feedback + heavy jobs on demand" pattern）
paths:
  - .github/workflows/**
  - .github/branch-protection.json
  - package.json
---

# CI Job Strategy — Required vs Opt-in と Branch Protection

> Stripe / Vercel / Linear / Shopify 公式 CI と同じ "fast PR feedback + heavy jobs on demand" pattern を採用。詳細は `../ci-workflow.md` のサブセクション。

## Required vs Opt-in job 分離（業界標準パターン）

毎 push で重い test job を実行すると runner minute 浪費 + maintenance 負債が蓄積する。

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

**workflow_dispatch inputs SSoT**:

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

## Visual baseline 再生成 SSoT

CI Ubuntu runner と font rendering を一致させるため CI 上で生成が canonical。ローカル Windows / macOS 生成は CI で必ず diff 出る。

1. `gh workflow run ci.yml --ref <branch> -f update_visual_baseline=true` で起動
2. CI が `bunx playwright test --project=chromium-visual --update-snapshots` を実行
3. 生成された `e2e/visual/**/*-snapshots/` を `peter-evans/create-pull-request@v8` が **別 branch (`ci/visual-baseline-<run_id>`) に push + 自動 PR 作成**
4. PR で required status checks (5 essential) を通過 → 人間レビュー → merge
5. baseline diff は PR の `Files changed` で binary diff としても確認可能

`permissions: { contents: write, pull-requests: write }` を当該 job に明示必要。

**禁止**:

- 重い job を main push で auto-run する設計（baseline 自動再生成は破壊的変更時に baseline を silent 上書きする risk）
- Visual baseline をローカルで生成して commit（CI と font rendering 不一致で必ず fail）
- `update_visual_baseline=true` の `workflow_dispatch` を main branch 以外で起動（auto-PR の base branch ミスマッチ）
- **main へ直接 push (`git push origin HEAD:${{ github.ref_name }}`) する旧パターン** — branch protection の required status checks (`GH006: protected branch hook declined`) で reject される。peter-evans/create-pull-request@v8 で PR 化必須
- branch protection の `bypass_actors` に `github-actions[bot]` を追加する迂回案（「bot は無検証」の運用リスク、PR ベースの方が clean）

### Visual baseline auto-PR pattern

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
  uses: peter-evans/create-pull-request@v8
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

**業界 reference**: Playwright 公式 docs / Chromatic (Storybook visual SaaS) / Percy (BrowserStack) は全て同 pattern。`peter-evans/create-pull-request@v8` は GitHub Marketplace verified action（typescript-eslint / shadcn-ui / Next.js 等で広く採用）。

### Repo settings prerequisite (`can_approve_pull_request_reviews=true`)

GitHub の新セキュリティデフォルト (2023〜) で workflow からの PR 作成は **デフォルト禁止**。`GITHUB_TOKEN` を使う auto-PR workflow は以下の repo setting が必要:

```bash
# 確認
gh api repos/<owner>/<repo>/actions/permissions/workflow
# → {"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}

# 有効化 (PR 作成のみ許可、default_workflow_permissions は read のまま維持)
gh api repos/<owner>/<repo>/actions/permissions/workflow \
  -X PUT \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=true
```

未有効化だと `##[error]GitHub Actions is not permitted to create or approve pull requests.` で peter-evans/create-pull-request@v8 が **branch push まで成功・PR 作成のみ fail** する silent UX bug。

### `GITHUB_TOKEN` で作成された PR は workflow を triggered しない

GitHub 公式無限ループ防止仕様。peter-evans/create-pull-request@v8 で生成された PR は `pull_request opened` event を発火しないため、required status checks が **未走行で branch protection が永久 block** する silent UX bug。

**Workaround SSoT**: `gh pr update-branch <num>` を実行すると `synchronize` event が発火して CI workflow が起動 + base branch との BEHIND も同時解消。完全自動化したい場合は ① PAT を `token:` に渡す ② `actions/create-github-app-token@v2` で GitHub App token 生成（公式推奨、PAT より securer）。

```bash
# auto-PR 生成後の標準 verify フロー
gh pr view <num> --json mergeStateStatus   # BEHIND / BLOCKED / UNSTABLE / CLEAN
gh pr update-branch <num>                  # synchronize event 発火 + base へ rebase
gh pr checks <num>                          # required 5 checks の green 確認
gh pr merge <num> --squash --delete-branch  # 業界標準 squash merge (Chromatic / Percy pattern)
```

`mergeStateStatus` 値の意味: `BEHIND`（base が進んでいる）/ `BLOCKED`（required checks 未完）/ `UNSTABLE`（required pass + optional fail）/ `CLEAN`（全 green）。`UNSTABLE` でも required pass なら merge 可能（branch protection は required のみ評価）。

## Branch Protection IaC（`gh api` SSoT 適用）

Required (毎 push 実行) job が完走するように pass-rate を確保した上で、GitHub Settings → Branches → Protection rules で **"Require status checks to pass before merging"** に以下を登録:

- `Dependency Audit (bun audit)`
- `Lint & Type Check`
- `Unit Tests`
- `Build (env validation)`
- `Bundle Analysis (Turbopack)`

opt-in job（E2E / Visual / Lighthouse）を required にすると、label を付け忘れた PR が永遠に merge できない silent UX bug になるため **required 登録禁止**。

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

## 関連

- `ci-workflow.md` — workflow 全体の SSoT
- `ci-workflow/debug.md` — gh CLI debug pattern / Billing / 監査 grep
- `ci-workflow/testing-perf.md` — Lighthouse / Playwright webServer
