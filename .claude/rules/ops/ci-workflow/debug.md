---
description: CI failure の gh CLI デバッグパターン / GitHub Actions billing / 監査 grep / bash glob 規律 / Lighthouse audit detail 取得
paths:
  - .github/workflows/**
  - package.json
  - scripts/run-tests.mjs
---

# CI Debug & Operations — gh CLI / Billing / 監査 grep

> CI failure 調査と日常運用の SSoT。詳細 root は `../ci-workflow.md` 参照。

## デバッグパターン（gh CLI）

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

## Billing（Actions minutes）

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

## 監査 grep（ワークフロー一括検査）

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

# 旧 major version 残存確認（全 7 種類 + 全 workflow file）
grep -rnE 'uses: (actions/(checkout|upload-artifact|cache|dependency-review-action|labeler|stale)|peter-evans/create-pull-request)@v[0-9]+' .github/workflows/ \
  | grep -vE 'checkout@v6|upload-artifact@v7|cache@v5|dependency-review-action@v5|labeler@v6|stale@v10|create-pull-request@v8'
```

## bash glob 展開規律（Actions step 内）

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

## gh CLI: job 単体 log を run 完了前に取得

```bash
# NG: run 全体完了まで block する（30+ 分待ち）
gh run view --log-failed --job <job-id>

# OK: gh api 直叩きで job 完了即 fetch 可能
gh api repos/<owner>/<repo>/actions/jobs/<job-id>/logs
```

run 内の 1 job だけ早期 debug したい時の canonical（例: E2E in_progress 中に Lighthouse fail の log を見たい）。

## Lighthouse audit detail を run 完了前に取得

`temporary-public-storage` upload URL を経由して run 全体完了を待たず audit detail を抽出可能:

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

failing audit の `selector` / `snippet` / `explanation` を取得して production code 側で fix する canonical workflow。

## 参考

- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) — `bun-version-file` 公式機能
- [Bun test mocks](https://bun.com/docs/test/mocks) — `mock.module()` live binding 仕様
- [GitHub Actions concurrency](https://docs.github.com/en/actions/using-jobs/using-concurrency)
- [CodeQL Default setup](https://docs.github.com/en/code-security/code-scanning/enabling-code-scanning/configuring-default-setup-for-code-scanning)
- [@t3-oss/env-nextjs](https://env.t3.gg/) — runtime / build env validation 設計
- `.claude/rules/bun-patterns/test-runner.md` §per-file isolation
- `.claude/rules/bun-patterns/mocking.md` §mock.module live binding
- `.claude/rules/test-quality/unit-bun.md` §fixture drift 検出
