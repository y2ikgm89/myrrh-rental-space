# GCP production IAP / Cloud Run 監査（2026-08-20）

読み取り専用。`bun run gcp:audit-production-iap` を実行する記録。

## 試行

- 日時: 2026-08-20（JST）
- アカウント: `admin@myrrh-jp.com`（`gcloud config get-value account`）
- 結果: **未完了**。`gcloud` の refresh token が切れており、非対話では
  `gcloud auth login` を完了できない。

```
ERROR: (gcloud.secrets.versions.list) There was a problem refreshing your current auth tokens:
Reauthentication failed. cannot prompt during non-interactive execution.
```

Secret Manager の list と同じ認証障害。破壊的操作はしていない。

## 再実行

対話で `gcloud auth login`（`admin@myrrh-jp.com`）したあと:

```sh
bun run gcp:audit-production-iap
```

成功したら本ファイルにコマンド出力の要約を追記する。失敗したらその stdout/stderr
を残す。本番への書き込みはしない。

## 結果（2026-08-21）

`bun run gcp:audit-production-iap` を実行。全 41 項目中 41 項目 PASS。

- 組織・Cloud Identity・Google Group 所有権: PASS
- Cloud Run service identity / ingress / max instance / traffic / default URL: PASS
- migrate Job identity / env / command / execution config: PASS
- Secret Manager version state / accessor IAM: PASS
- Cloud Run revision health: PASS
- admin IAP enabled / invoker / non-public / group access: PASS
- public /api/live 200、/api/health 404、/admin 404: PASS
- admin root /admin 302 → accounts.google.com: PASS
- WIF provider active / repository 制限: PASS
- プロジェクト IAM / Secret Manager / Artifact Registry / Cloud Build 権限: PASS
- Cloud Scheduler OIDC / legacy trigger / connection 不在: PASS

出力: `PASS: production posture matches the org-backed group IAP + WIF model.`
