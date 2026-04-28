# How-to — 手順

> 問題解決指向のドキュメント。「特定のタスクを達成するには」に答える。

[Diátaxis](https://diataxis.fr/how-to-guides/) の **how-to** に相当する。読み終えた後に「目的を達成できる」状態を目指す。背景や設計判断は [`../explanation/`](../explanation/) を、API 仕様は [`../reference/`](../reference/) を参照。

## ドキュメント

### デプロイ・インフラ

| ファイル                                       | やりたいこと                                       |
| ---------------------------------------------- | -------------------------------------------------- |
| [deploy.md](./deploy.md)                       | Google Cloud Run へのデプロイ（IAM / Secret 含む） |
| [docker.md](./docker.md)                       | Docker イメージのビルド・実行                      |
| [cloudflare.md](./cloudflare.md)               | Cloudflare DNS / CDN / SSL 設定                    |
| [cron-schedule.md](./cron-schedule.md)         | Cloud Scheduler / cron job の設定                  |
| [harden-protection.md](./harden-protection.md) | DDoS / レート制限 / Turnstile / Cloud Run の固め方 |

### データベース・認証

| ファイル                                                   | やりたいこと                            |
| ---------------------------------------------------------- | --------------------------------------- |
| [prisma-schema-cleanup.md](./prisma-schema-cleanup.md)     | 未使用カラム・enum 値の破壊的整理       |
| [fix-legacy-lexical-rows.md](./fix-legacy-lexical-rows.md) | 旧 Lexical EditorState JSON の SQL 修正 |
| [better-auth-checklist.md](./better-auth-checklist.md)     | Better Auth 公式準拠の再監査            |

### Next.js / Server Actions

| ファイル                                       | やりたいこと                            |
| ---------------------------------------------- | --------------------------------------- |
| [next-cache-review.md](./next-cache-review.md) | Next 16 キャッシュ・Server Actions 観点 |
