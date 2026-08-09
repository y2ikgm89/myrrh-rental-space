# AGENTS.md

このリポジトリのコーディングエージェント向け指示の正本は **[CLAUDE.md](CLAUDE.md)**
と **[`.claude/rules/`](.claude/rules/)** です。Claude Code 以外のエージェントも
まず CLAUDE.md を読んでください（重複を置くと必ず片方が古くなるため、ここには
複製しません）。

- 絶対規約・検証コマンド・変更フロー → [CLAUDE.md](CLAUDE.md)
- 話題別の詳細ルール → [`.claude/rules/`](.claude/rules/)
- 多段手順（migration / セクション追加 / E2E / デプロイ調査） → [`.claude/skills/`](.claude/skills/)
- 人間向けセットアップ → [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)

## 破壊的 migration の発動条件

本番デプロイ（`.github/workflows/deploy-production.yml` の手動 dispatch）は、
適用対象の migration SQL が下記のいずれかを含むとき、公開・管理の両サービスを
scale 0 にして 310 秒 drain する**計画ダウンタイムモード**に入る。判定の SSoT は
workflow 内の正規表現で、この列挙はそこから導出したものと集合一致することを
`__tests__/unit/architecture/breaking-migration-detection.test.ts` が強制する。

<!-- breaking-triggers:start -->

ALTER TABLE ... ALTER COLUMN ... DROP DEFAULT /
ALTER TABLE ... ALTER COLUMN ... SET NOT NULL /
ALTER TABLE ... ALTER COLUMN ... TYPE /
ALTER TABLE ... DROP COLUMN /
ALTER TABLE ... DROP CONSTRAINT /
ALTER TABLE ... RENAME COLUMN /
ALTER TABLE ... RENAME TO /
ALTER TYPE ... RENAME TO /
ALTER TYPE ... RENAME VALUE /
DROP TABLE /
DROP TYPE

<!-- breaking-triggers:end -->

意図的に破壊的な migration を通すときは、SQL 先頭に
`-- squawk-ignore-file <rule>` を書く。散文で「安全だ」と主張しても通らない。
手順は [`.claude/rules/migrations.md`](.claude/rules/migrations.md) を参照。
