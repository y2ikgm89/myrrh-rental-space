# 0026 — Skill naming convention

- **Status**: Accepted
- **Date**: 2026-04-28
- **Deciders**: C5a Phase 3 clean-break refactor

## Context

プロジェクトの `.claude/skills/` ディレクトリには 33 件の skill が蓄積された。命名が `cloud-run-debug`（suffix 形式）/ `cache-audit`（suffix 形式）/ `audit-settings-sections`（prefix 形式）と混在し、一覧性が低下していた。

また、新規 skill 追加時に命名基準が存在せず、担当者によって形式が統一されない問題が顕在化した。

## Decision

Skill naming convention を以下の prefix 体系で統一する:

| Prefix                | 用途                                                                                                                      | 例                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add-*`               | 新規リソース追加（DB enum / Settings field 等）                                                                           | `add-prisma-enum`, `add-settings-field`                                                                                                                                                                     |
| `create-*`            | scaffolding 生成（admin page / page content / server action / section type 等）                                           | `create-admin-page`, `create-page-content`, `create-server-action`, `create-section-type`                                                                                                                   |
| `audit-*`             | 監査・検出（cache / seed / ssot / use-server / memory-staleness / adr-drift / integration / lexical / settings-sections） | `audit-cache`, `audit-seed`, `audit-ssot`                                                                                                                                                                   |
| `debug-*`             | 環境・サービス診断（cloud-run / google-calendar / instagram / stripe / turbopack）                                        | `debug-cloud-run`, `debug-stripe`, `debug-turbopack`                                                                                                                                                        |
| `<topic>` (no prefix) | 機能・カテゴリ skill（workflow / tooling / design 系）                                                                    | `frontend-design`, `parallax-section`, `ui-ux-pro-max`, `verify-subagent-report`, `subagent-dispatch-template`, `upgrade-deps`, `prisma-migration`, `adr-create`, `worktree-bootstrap`, `split-action-file` |

## Consequences

### 実施済み（C5a Task 3.4 commit）

- 5 件の debug skills: `cloud-run-debug` → `debug-cloud-run` / `google-calendar-debug` → `debug-google-calendar` / `instagram-debug` → `debug-instagram` / `stripe-debug` → `debug-stripe` / `turbopack-hmr` → `debug-turbopack`
- 8 件の audit skills: `cache-audit` → `audit-cache` / `lexical-audit` → `audit-lexical` / `seed-audit` → `audit-seed` / `ssot-audit` → `audit-ssot` / `use-server-audit` → `audit-use-server` / `memory-staleness-audit` → `audit-memory-staleness` / `adr-drift-audit` → `audit-adr-drift` / `integration-audit` → `audit-integration`
- `audit-settings-sections` は既に `audit-*` prefix で変更不要

### 今後の規律

- **新規 skill 作成時は本 ADR の prefix 体系に従う**
- **例外は ADR で正当化が必要**
- `debug-*` 系は `disable-model-invocation: true` を付与（AI による自動起動禁止）

## Compliance / Validation

```bash
# debug-* / audit-* / add-* / create-* prefix の統一確認
ls .claude/skills/ | sort

# 旧 *-debug / *-audit suffix 名が残存していないか
ls .claude/skills/ | grep -E '\-(debug|audit)$'
# Expected: 出力ゼロ
```
