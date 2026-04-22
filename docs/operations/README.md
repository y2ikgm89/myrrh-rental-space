# 運用・デプロイ

本番環境の構築・運用に関するドキュメント。

## ドキュメント一覧

| ドキュメント                                   | 説明                                           |
| ---------------------------------------------- | ---------------------------------------------- |
| [デプロイ](./deployment.md)                    | Google Cloud Runへのデプロイ手順               |
| [Docker](./docker.md)                          | Dockerイメージのビルド・実行                   |
| [Cloudflare](./cloudflare.md)                  | CDN・DDoS保護設定                              |
| [Bun](./bun.md)                                | Bunランタイム設定                              |
| [Lexical JSON](./lexical-editor-state-json.md) | EditorState JSON の契約・レガシー行の SQL 修正 |

## 環境構成

```
[ユーザー] → [Cloudflare CDN] → [Cloud Run] → [PostgreSQL]
                  ↓
            [Turnstile]（Bot保護）
```

## デプロイチェックリスト

**初回のみ**

- [ ] Artifact Registry `myrrh-rental-space` 作成
- [ ] dedicated runtime SA 作成（`myrrh-rental-space-runtime@...`）+ `secretmanager.secretAccessor` / `logging.logWriter` 付与
- [ ] Cloud Build SA に `roles/iam.serviceAccountUser`（runtime SA impersonation）付与
- [ ] Secret Manager に必須シークレット 6 種登録（`DATABASE_URL` / `BETTER_AUTH_SECRET` / `ENCRYPTION_KEY` / `CRON_SECRET` / `ADMIN_LOGIN_TOKEN` / `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`）+ R2 系 5 種
- [ ] Prisma migrate Cloud Run Job 初期作成（placeholder image、`deployment.md` §6）
- [ ] Cloud Build trigger substitutions 設定（`_SERVICE_ACCOUNT` / `_NEXT_PUBLIC_BASE_URL` / `_NEXT_PUBLIC_APP_URL` / `_BETTER_AUTH_URL` 必須）

**毎デプロイ**

- [ ] `bun run validate && bun run build` ローカル確認
- [ ] schema 変更時は `prisma/migrations/` 同梱コミット
- [ ] デプロイ後 `curl $URL/api/live` で probe endpoint 動作確認（`{"status":"alive"}`）
- [ ] デプロイ後 `curl $URL/api/health` で DB 疎通確認（`{"status":"healthy",...}`）

**DNS / 外部**

- [ ] Cloudflare DNS 設定
- [ ] SSL 証明書確認（Cloud Run Managed or Cloudflare）

## 関連ドキュメント

- [セキュリティ](../security/README.md)
- [アーキテクチャ](../architecture/README.md)
