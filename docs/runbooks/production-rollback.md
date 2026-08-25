# 本番 rollback

Deploy Production のあと、公開面の smoke が赤になった・本番で回帰が出た・
DB を戻した、のいずれかのときに読む。自動 rollback は無い。切り戻しは
人手で、この文書の手順だけを使う。

migration の SQL は触らない。適用済みファイルを書き換えると
`scripts/check-protected-files.sh` が deny し、本番の
`_prisma_migrations.checksum` 照合が次のデプロイを落とす。

## 1. いつ読むか

- Deploy Production の `post-deploy-smoke` が赤
- 本番で回帰が出た（公開面の 5xx / 明らかな機能破損）
- Neon を過去へ戻した（[`database-restore.md`](database-restore.md)）

検証の切り分けは
[`post-deploy-verification.md`](post-deploy-verification.md)。
失敗しても **revision は既に出ている**。workflow が赤なのは「検証 NG」の
明示であり、ここから自動では戻らない。

## 2. 先に決める: image だけで戻せるか

判定入力は、当該 Deploy Production run の Job Summary 見出し
`## rollback 判定`。そこに出るのは次の 3 つだけ。

- `BREAKING_MIGRATION_DEPLOY` の値
- 破壊的判定の base commit
- この deploy で適用対象になった migration ファイル（0 件なら「なし」）

`false` かつ migration 一覧が「なし」なら **ケース A**（image だけ）。
`true` か、一覧に 1 件でもあるなら **ケース B**（DB を戻す）。

run が残っていないときは、workflow と同じ窓で再計算する。
`<deployed-sha>..HEAD` は使わない。当該 commit を checkout していると
差分が空になり、ケース A へ倒す。

```sh
# 当該 deploy の SHA は headSha。list の既定表示には出ない。
# promote 後の traffic[0] もこちら（<deployed-sha>）になる。
gh run list --workflow=deploy-production.yml --branch main --limit 5 \
  --json databaseId,headSha,displayTitle,conclusion,url

# BASE_SHA は「この deploy が始まる直前に serving していた commit」。
# 今の serving image tag を使わない（promote 済みなら deployed-sha と同じになり、
# 空 diff → ケース A）。一つ前の成功 run の headSha、または
# 今の serving の一つ前の revision の git SHA tag。
git diff --name-only <previous-serving-sha> <deployed-sha> \
  -- 'prisma/migrations/**/migration.sql'
```

差分が空ならケース A。1 行でもあればケース B。推測で A に倒さない。

## 3. ケース A: image だけで戻す

Cloud Run の残存 revision へ traffic を戻す。2026-08-25 時点の実測は
**705 本**（`00001-bgd` … `00709-5xv`）。何本残っているかは毎回
`revisions list` で確認する。このリポジトリは保持期間を宣言しない。

```sh
gcloud run revisions list --service myrrh-rental-space \
  --region asia-northeast1 --project myrrh-rental-space \
  --format='table(name, creationTimestamp, status.conditions[0].status)'

gcloud run services update-traffic myrrh-rental-space \
  --to-revisions "<revision-name>=100" \
  --region asia-northeast1 --project myrrh-rental-space
```

admin 面（`myrrh-rental-space-admin`）も同じ操作が要る。公開面だけ戻して
admin を残すと、schema 互換が崩れたときに管理操作だけが新しい image のまま
動く。

戻す先は「壊れる直前に serving していた revision」。image digest と
Artifact Registry の git SHA tag で照合する。digest だけの image を
`##*:` で切るとタグにならない。

## 4. ケース B: migration を含む

image だけ戻しても、新しいスキーマを古いコードが叩く（またはその逆）と
落ちる。先に DB を戻す。手順の本体は
[`database-restore.md`](database-restore.md)。

PITR でいつまで戻せるかは Neon コンソールの Project settings
（`history_retention_seconds`）でその場で確認する。**このリポジトリは
窓の時間を記録しない。** 書いてある数字を信じて戻さない。

DB を戻したあと、その時点で動いていた Cloud Run revision へケース A の
`update-traffic --to-revisions` を打つ。新しいコードが古いスキーマを
叩かないようにする。

## 5. pin 中の注意

`update-traffic --to-revisions` は Terraform の宣言
（`TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST` / `percent = 100`）と食い違う。
`ignore_changes` に `traffic` が入っているので、次の
`terraform-apply` は pin を消さない。

pin を外すのは次に Deploy Production を完走したときの末尾
`update-traffic --to-latest`（promote）だけ。止血の pin を残したまま
通常出荷したいなら、revert commit を merge してから普通に dispatch する。

## 6. 監査の扱い

`bun run gcp:audit-production-iap` は
`traffic.length !== 1` を違反にする
（`scripts/gcp-production-audit-model.ts` の
`readCloudRunTrafficLatestErrors`）。pin 中は監査が赤になる。
止血中の赤は想定どおり。恒久化しない。

## 7. admin 面の検出限界

admin は `ingress = INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` かつ
`default_uri_disabled = true`。外から中身は検証できない。
`post-deploy-smoke` が見るのは `ADMIN_DOMAIN/` の 302 / 401 だけ。

**admin の論理回帰はこの層では検出できない。** 検出できるふりをしない。
公開面の 200 と IAP の 302/401 が緑でも、管理画面の mutation は壊れている
ことがある。
