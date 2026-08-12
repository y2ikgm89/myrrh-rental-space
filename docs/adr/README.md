# Architecture Decision Records (ADR)

長期にわたって影響する architectural / infrastructure 決定を記録する。
「なぜこの構造なのか」を future session (自分・他人・Claude) が思い出せるようにし、
同じ議論が再 litigate されるのを防ぐことが目的。

## When to write an ADR

以下いずれかに該当する場合は ADR を書く:

- **後から re-evaluate する可能性がある構造決定** (単一 env / multi-env、
  monolith / microservice、library / framework 選定など)
- **rejected alternatives が明確にあり、それらを再提案されると context を消費する**
  決定 (再 litigate 防止パターン)
- **migration trigger を明文化しないと意思決定が遅れる**決定 (SLA 契約時 /
  スケール変化時 / チーム拡大時など)
- **security posture** の設計選択 (bootstrap-owned IAM の SSoT 契約など)

小さな実装選択 (関数命名 / file 配置) や、gate (`__tests__/unit/architecture/**`)
で機械的に強制済の運用ルールは ADR にしない。

## Index

採番は 2026-07-14 に 0001 から振り直した。旧系列
(`docs/architecture/decisions/0001`-`0028`) は commit 8ebd49c2d で全削除済みで、
番号は現行系列と対応しない。

| #                                                          | Title                                            | Status   | Date       |
| ---------------------------------------------------------- | ------------------------------------------------ | -------- | ---------- |
| [0001](0001-single-env-terraform.md)                       | Single-env Terraform (prod only)                 | Accepted | 2026-07-14 |
| [0002](0002-abolish-main-terraform-health-gate.md)         | Main Terraform Health gate の廃止                | Accepted | 2026-07-25 |
| [0003](0003-stay-on-deprecated-react-email-components.md)  | deprecated な `@react-email/components` に留まる | Accepted | 2026-08-11 |
| [0004](0004-accept-soft-404-under-streaming.md)            | streaming 下の soft 404 を受け入れる             | Accepted | 2026-08-11 |
| [0005](0005-node-runtime-for-next-server-bun-elsewhere.md) | Next サーバーだけ Node、それ以外は Bun           | Accepted | 2026-08-12 |

## Template

新規 ADR は下記 template をコピーして `docs/adr/NNNN-<kebab-case-title>.md` を
作成する。番号は index の次の連番。

```markdown
# ADR NNNN: <title>

Status: <Proposed | Accepted | Deprecated | Superseded by ADR-NNNN> (<YYYY-MM-DD>)

## Context

決定を必要とした背景。何を評価したか。制約条件。

## Decision

採用した決定を bold で明確に。詳細な実装は該当 config / code へリンク。

## Rationale

Decision を選んだ理由の bullet list。定量的根拠 (コスト / パフォーマンス数値)
があれば必ず含める。

## Migration Triggers (re-evaluate すべき条件)

この判断を re-evaluate する trigger 条件を列挙。「いつまで有効か」ではなく
「何が変わったら再検討すべきか」を書く。省略可 (静的な決定は不要)。

## Rejected Alternatives

検討して却下した選択肢と却下理由。「なぜ他じゃないのか」を将来の再提案に
対して防御的に記録する。

## Related

- 関連 PR / commit、該当 gate (`__tests__/unit/architecture/**`)、
  運用文書 index ([`../README.md`](../README.md))、他 ADR への link
- repo 外 (session memory / エージェント設定) は書かない — 削除・移動で追跡不能になる
```

## Lifecycle

- **Proposed**: draft / 議論中
- **Accepted**: 実装済み or 実装決定済み
- **Deprecated**: 有効でなくなったが履歴として残す (superseded なしで単に廃止)
- **Superseded by ADR-NNNN**: 別 ADR に置き換えられた (元 ADR は削除せず、
  status を更新して link を張る)

**ADR は削除しない** (履歴が消えると future session が同じ議論を re-litigate する)。
無効になった決定も status 更新のみで残す。
