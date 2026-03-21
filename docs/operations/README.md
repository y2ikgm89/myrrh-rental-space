# 運用・デプロイ

本番環境の構築・運用に関するドキュメント。

## ドキュメント一覧

| ドキュメント                  | 説明                             |
| ----------------------------- | -------------------------------- |
| [デプロイ](./deployment.md)   | Google Cloud Runへのデプロイ手順 |
| [Docker](./docker.md)         | Dockerイメージのビルド・実行     |
| [Cloudflare](./cloudflare.md) | CDN・DDoS保護設定                |
| [Bun](./bun.md)               | Bunランタイム設定                |
| [Lexical JSON](./lexical-editor-state-json.md) | EditorState JSON の契約・レガシー行の SQL 修正 |

## 環境構成

```
[ユーザー] → [Cloudflare CDN] → [Cloud Run] → [Supabase PostgreSQL]
                  ↓
            [Turnstile]（Bot保護）
```

## デプロイチェックリスト

- [ ] 環境変数設定（`ENCRYPTION_KEY`, `DATABASE_URL`等）
- [ ] Prismaマイグレーション実行
- [ ] Cloudflare DNS設定
- [ ] SSL証明書確認

## 関連ドキュメント

- [セキュリティ](../security/README.md)
- [アーキテクチャ](../architecture/README.md)
