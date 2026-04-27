---
name: adr-drift-audit
description: ADR (docs/architecture/decisions/) の制約と設定ファイル（bunfig.toml / playwright.config.ts / .gitignore / package.json / .github/workflows/*.yml / cloudbuild.yaml / lefthook.yml）の乖離を検出する。ADR 新規採択後や定期メンテで使用。設定が ADR 制約と矛盾した dead code 化していないか確認する。
paths:
  - docs/architecture/decisions/**
  - bunfig.toml
  - playwright.config.ts
  - .gitignore
  - package.json
  - cloudbuild.yaml
  - lefthook.yml
  - .github/workflows/**
---

# ADR Drift 監査

採択済み ADR の `## Compliance / Validation` 節と現実の設定ファイルを照合し、乖離を検出する。
ADR 0010 採択後も `bunfig.toml` に `coverageThreshold` が残存していた（2026-04-22 発見）ような drift を防ぐための定期 audit。

## 実行タイミング

- ADR 新規採択直後（Compliance 項目が書かれた状態で現実設定と突合）
- 依存更新後（`bun update` 後に設定ファイル構成が変わる可能性）
- 月次メンテ（dead code 化した制約を検出）
- リファクタリング PR 前（削除した script / 設定への参照残存チェック）

## チェック対象 ADR と設定ファイル

| ADR  | 制約元                               | 検証すべき設定ファイル                                                                                                                                                    |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 | Multiple Root Layouts                | `src/app/(admin)/layout.tsx` / `src/app/(public)/layout.tsx` に `<html>` / `<body>` が両方存在                                                                            |
| 0002 | Prisma re-export gateway (type-only) | `src/shared/lib/validations/enums/prisma-types.ts` に `export type { Prisma }` / `.browser entry`                                                                         |
| 0003 | Playwright storage state             | `playwright.config.ts` の `storageState` / `globalSetup`                                                                                                                  |
| 0004 | Turbopack-native bundle analyzer     | `package.json` scripts に `next experimental-analyze`（`@next/bundle-analyzer` 不使用）                                                                                   |
| 0005 | Lefthook                             | `lefthook.yml` 存在・`package.json` `prepare` scripts                                                                                                                     |
| 0006 | Renovate over Dependabot             | `renovate.json` / `.github/renovate.json` 存在・`.github/dependabot.yml` 不在                                                                                             |
| 0007 | axe-core for a11y                    | `e2e/` 配下の `@axe-core/playwright` import / `.github/workflows/ci.yml` の a11y job                                                                                      |
| 0008 | Conventional Commits                 | `lefthook.yml` `commit-msg` hook / `scripts/check-commit-msg.sh`                                                                                                          |
| 0009 | admin-roles client-safe SSoT         | `src/shared/lib/admin-roles.ts` に `import "server-only"` **不在** / `admin-auth.ts` が re-export                                                                         |
| 0010 | per-directory test batch             | `package.json` `test:unit` / `test:integration` が `&&` チェーン / `bunfig.toml` に `coverage` 設定 **不在**                                                              |
| 0011 | Dual Better Auth instance            | `admin-auth.ts` / `customer-auth.ts` で cookiePrefix 分離                                                                                                                 |
| 0012 | executeAdminMutationResult           | 管理 Server Actions で `executeAdminMutationResult` 呼び出し（`src/app/(admin)/**/*.ts` grep）                                                                            |
| 0013 | Policy docs sync                     | `scripts/verify-policy-docs.mjs` 存在・`.github/workflows/ci.yml` の policy-docs-sync job                                                                                 |
| 0014 | Test script consolidation            | `package.json` に `test` / `test:watch` / `test:coverage` / `test:coverage:check` **不在** / `bunfig.toml` coverage 設定 **不在** / `scripts/check-coverage.mjs` **不在** |
| 0015 | Clean-break refactor discipline      | `docs/architecture/decisions/0015-*.md` の parallel implementer 禁止記述と `.claude/agents/*.md` / CLAUDE.md §Subagent 規律 の整合                                        |
| 0016 | Page hero first-class field          | `prisma/schema.prisma` の `Page.pageHero Json?` 存在 + `homepage-hero` Section type 不在（`src/shared/lib/sections/registry.ts` で廃止確認）+ `pageHeroSchema` 実装       |
| 0017 | Section style cascade                | `prisma/schema.prisma` の `SectionStyle` model + `Section.styleId` + `Page.defaultStyleId` + `Settings.defaultSectionStyleId` の 4-tier cascade 実装                      |
| 0018 | Field registry + group hierarchy     | `src/shared/lib/sections/field-registry.ts` の `z.registry<FieldMeta>()` 存在 + `field-helpers.ts` **不在** + `FieldMeta.group` 必須 + Accordion 3 層 UI                  |

## ワークフロー

### Step 1: ADR インデックスから対象リストアップ

```bash
ls docs/architecture/decisions/*.md | grep -vE "README|0000-template" | sort
```

### Step 2: 各 ADR の Compliance 節を抽出

```bash
# Compliance / Validation 節のある ADR をリスト
for adr in docs/architecture/decisions/00*.md; do
  grep -l "^## Compliance" "$adr" 2>/dev/null && echo "  -> $adr"
done
```

### Step 3: 設定ファイルと照合

ADR ごとに以下の grep パターンで drift 検出:

```bash
# ADR 0010 / 0014: bunfig.toml に coverage 設定不在
grep -nE "^coverage(Threshold|Reporter|Dir|SkipTestFiles|IgnoreSourcemaps|PathIgnorePatterns)" bunfig.toml && echo "❌ ADR 0010/0014 violation: coverage settings残存"

# ADR 0014: 廃止 script が package.json にないこと
grep -nE '"(test|test:watch|test:coverage|test:coverage:check)"\s*:' package.json && echo "❌ ADR 0014 violation: 廃止 script残存"

# ADR 0014: check-coverage.mjs が存在しないこと
ls scripts/check-coverage.mjs 2>/dev/null && echo "❌ ADR 0014 violation: scripts/check-coverage.mjs残存"

# ADR 0006: Dependabot 設定が存在しないこと
ls .github/dependabot.yml 2>/dev/null && echo "❌ ADR 0006 violation: dependabot.yml残存"

# ADR 0009: admin-roles.ts に server-only がないこと
head -10 src/shared/lib/admin-roles.ts | grep -q '"server-only"' && echo "❌ ADR 0009 violation: admin-roles.ts が server-only"

# ADR 0005: lefthook.yml 存在
ls lefthook.yml >/dev/null 2>&1 || echo "❌ ADR 0005 violation: lefthook.yml 不在"

# ADR 0008: commit-msg hook 存在
grep -q "commit-msg:" lefthook.yml 2>/dev/null || echo "❌ ADR 0008 violation: commit-msg hook 不在"
```

### Step 4: 横断 grep: 廃止識別子の参照残存チェック

ADR で廃止された script / 定数 / API の横断 grep:

```bash
# 廃止 script: bun run test / test:watch / test:coverage / test:coverage:check
grep -rnE 'bun run test(\s|$|[^:a-z])|bun run test:(watch|coverage)' \
  --include="*.md" --include="*.ts" --include="*.tsx" --include="*.yml" --include="*.yaml" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=generated .

# 旧 ADR 番号参照（ADR 0011 は 2 つあったため rename 後の旧参照チェック）
grep -rnE "0011-test-script" \
  --include="*.md" --include="*.ts" --include="*.yml" \
  --exclude-dir=node_modules --exclude-dir=.next .
```

## 出力フォーマット

```markdown
## ADR Drift 監査レポート

### 総評

- ADR 14 件中、drift 検出: X 件
- 設定ファイル drift: Y 件
- 廃止識別子残存: Z 件

### Drift 詳細

#### ADR 0010 / 0014 — Coverage 設定残存

**場所**: `bunfig.toml:19`
**制約**: per-directory batch と coverage は非互換のため設定撤去
**現実**: `coverageThreshold = { line = 0.9 }` が残存
**修正**: `bunfig.toml` から `coverage*` キー全削除

#### ADR 0014 — 廃止 script 残存

**場所**: `docs/guides/testing.md:88`
**制約**: `bun run test` は廃止、`test:unit` / `test:all` を使う
**現実**: `bun run test` への言及 5 件
**修正**: 参照を `bun run test:unit` に置換

### ✅ Clean ADR

- ADR 0001 / 0002 / 0003 / 0005 / 0008 / 0011 / 0012 / 0013

### 手動確認が必要な制約

[grep では判定できない構造的制約を列挙]
```

## 既知の false positive

- ADR 本文自身が「旧識別子を廃止した」記述のため旧名を含む → ADR ファイルは grep 結果から除外して判断
- `git log` 参照を勧める redirect 化 doc（`docs/guides/testing.md` 等）は旧識別子の歴史的記述を含む場合あり

## 参照

- [ADR README](../../../docs/architecture/decisions/README.md)
- [CLAUDE.md §Git / Migration](../../../CLAUDE.md#git--migration) — 「ADR 制約と設定ファイルの整合を grep で周期検証」
